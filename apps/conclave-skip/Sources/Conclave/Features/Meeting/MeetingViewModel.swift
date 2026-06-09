//
//  MeetingViewModel.swift
//  Conclave
//
//  Production ViewModel with WebRTC integration
//

import Foundation
import Observation
#if !SKIP
import SkipFuse
#endif
#if canImport(AVFoundation)
import AVFoundation
#endif

@MainActor
@Observable
final class MeetingViewModel {

    // Process-wide singleton so the live call (socket + WebRTC + connectionState)
    // SURVIVES Android Activity / Compose recreation and the PiP composition
    // swap. The foreground service keeps the process alive in the background, so
    // when the user returns the root view re-derives the in-call screen from this
    // still-`.joined` VM instead of a fresh one (which would dump them on the
    // join screen and orphan the call).
    static let shared = MeetingViewModel()

    var state = MeetingState()

    // MARK: - Reactions

    var reactionLaneCounter = 0

    // MARK: - Managers

    let socketManager = SocketIOManager()
    let webRTCClient = WebRTCClient()
    var lastJoinContext: JoinContext?
    var shouldRejoinAfterReconnect = false
    var isIntentionalLeave = false
    var isRejoinInFlight = false

    // MARK: - Active Speaker

    // Client-side active-speaker detection: poll each remote audio consumer's
    // WebRTC `audioLevel` stat, pick the loudest above a threshold, debounce so
    // the speaking ring doesn't flicker. Mirrors the web client (no SFU event).
    private var activeSpeakerTask: Task<Void, Never>?
    private var lastActiveSpeakerId: String?
    private var lastActiveSpeakerAt: Date?
    private let activeSpeakerThreshold: Double = 0.01
    private let activeSpeakerHoldSeconds: Double = 0.6

    func displayNameForUser(_ id: String) -> String {
        state.displayName(for: id)
    }

    struct JoinContext {
        let roomId: String
        let displayName: String
        let isGhost: Bool
        let isHost: Bool
        let user: SfuJoinUser?
    }
    
    // MARK: - Init
    
    init() {
        setupSocketBindings()
        setupWebRTCBindings()
    }
    
    // MARK: - Socket Bindings
    
    func setupSocketBindings() {
        socketManager.onConnected = { [weak self] in
            Task { @MainActor in
                guard let self = self else { return }
                // socket.io fires 'connect' on every RECONNECT too, not just the
                // first connect. Routing to .connected mid-call would flash the
                // join screen for one frame (ContentView maps .connected →
                // JoinView) before onReconnected → rejoinIfPossible moves us to
                // .joining. While a reconnect is pending, stay on the reconnecting
                // overlay (.reconnecting → MeetingView); a genuine first connect
                // (no call in progress) still surfaces .connected.
                if self.shouldRejoinAfterReconnect && !self.isIntentionalLeave {
                    self.state.connectionState = ConnectionState.reconnecting
                    // Drive the rejoin from here too: socket.io can emit 'connect'
                    // without a following 'reconnect' (onReconnected), which would
                    // otherwise leave us parked in .reconnecting forever. The
                    // isRejoinInFlight / shouldRejoinAfterReconnect guards in
                    // rejoinIfPossible keep this idempotent with onReconnected.
                    Task { await self.rejoinIfPossible() }
                    return
                }
                self.state.connectionState = ConnectionState.connected
            }
        }
        
        socketManager.onDisconnected = { [weak self] reason in
            Task { @MainActor in
                guard let self = self else { return }
                if self.isIntentionalLeave {
                    self.state.connectionState = ConnectionState.disconnected
                    return
                }
                self.state.connectionState = ConnectionState.reconnecting
                self.shouldRejoinAfterReconnect = true
                if let reason = reason {
                    self.state.errorMessage = reason
                }
            }
        }
        
        socketManager.onError = { [weak self] error in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.errorMessage = error.localizedDescription
                #if !SKIP
                HapticManager.shared.trigger(.error)
                #endif
            }
        }

        socketManager.onReconnecting = { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                if !self.isIntentionalLeave {
                    self.state.connectionState = ConnectionState.reconnecting
                }
            }
        }

        socketManager.onReconnected = { [weak self] in
            Task { [weak self] in
                guard let self = self else { return }
                await self.rejoinIfPossible()
            }
        }

        socketManager.onReconnectFailed = { [weak self] in
            Task { [weak self] in
                guard let self = self else { return }
                await self.forceRejoinWithFreshToken()
            }
        }
        
        socketManager.onJoinedRoom = { [weak self] response in
            Task { @MainActor in
                guard let self = self else { return }
                
                self.state.connectionState = ConnectionState.joined
                self.state.waitingMessage = nil

                // On a RECONNECT-driven rejoin the prior session's mediasoup
                // Device / transports / producers / consumers are STILL LIVE —
                // cleanup() only runs on an explicit leave / kick / end, not on a
                // socket reconnect. Re-running configure()/createTransports() over
                // them leaks native objects every reconnect and can leave media
                // half-dead (new transports racing the SFU's old producers). Tear
                // the old session down first. cleanup(notifyLocalState: false)
                // resets the produce-flags WITHOUT firing the mute/camera change
                // callbacks (whose async @MainActor hop would otherwise land
                // after this and flip state.isMuted/isCameraOff back to true) —
                // so the user's current intent is preserved and startProducing
                // re-publishes audio/video correctly.
                if self.webRTCClient.isConfigured {
                    await self.webRTCClient.cleanup(notifyLocalState: false)
                }

                // Hydrate room policy from the join response (optional fields).
                if let locked = response.isLocked {
                    self.state.isRoomLocked = locked
                }
                if let noGuests = response.noGuests {
                    self.state.isNoGuests = noGuests
                }
                if let dmEnabled = response.isDmEnabled {
                    self.state.isDmEnabled = dmEnabled
                }
                if let ttsDisabled = response.isTtsDisabled {
                    self.state.isTtsDisabled = ttsDisabled
                }

                // Configure WebRTC with server capabilities
                self.webRTCClient.configure(
                    socketManager: self.socketManager,
                    rtpCapabilities: response.rtpCapabilities
                )
                
                // Create transports
                do {
                    try await self.webRTCClient.createTransports()
                    
                    // Start producing if not ghost
                    if !self.state.isGhostMode {
                        await self.startProducing()
                    }
                    
                    // Consume existing producers
                    for producer in response.existingProducers {
                        try await self.webRTCClient.consumeProducer(
                            producerId: producer.producerId,
                            producerUserId: producer.producerUserId,
                            producerType: producer.type
                        )
                        self.handleProducerState(producer)
                    }

                    // Light up the speaking ring from remote audio levels.
                    self.startActiveSpeakerPoll()

                    // Only bring up the OS-level call presence (iOS CallKit +
                    // audio-interruption recovery; Android ongoing-call FGS + PiP)
                    // once the media path is actually up — otherwise a failed
                    // setup would leave a CallKit call / foreground service with
                    // no live audio.
                    self.activateCallPresence()
                } catch {
                    debugLog("[Meeting] WebRTC setup error: \(error)")
                    #if SKIP
                    android.util.Log.e("ConclaveScreenCap", "VM WebRTC setup error: \(error)")
                    #endif
                    self.state.errorMessage = error.localizedDescription
                    #if !SKIP
                    HapticManager.shared.trigger(.error)
                    #endif
                    // Setup failed — make sure no call presence is left armed.
                    self.deactivateCallPresence()
                }
            }
        }

        socketManager.onWaitingForAdmission = { [weak self] in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.connectionState = ConnectionState.waiting
            }
        }
        
        socketManager.onWaitingRoomStatus = { [weak self] message in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.waitingMessage = message
            }
        }
        
        socketManager.onJoinApproved = { [weak self] in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.connectionState = ConnectionState.joining
            }
            Task { [weak self] in
                guard let self = self else { return }
                await self.rejoinIfPossible()
            }
        }
        
        socketManager.onJoinRejected = { [weak self] in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.connectionState = ConnectionState.error
                self.state.errorMessage = "The host has denied your request to join."
                #if !SKIP
                HapticManager.shared.trigger(.error)
                #endif
                await self.cleanup()
            }
        }

        socketManager.onHostAssigned = { [weak self] in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isAdmin = true
            }
        }
        
        socketManager.onKicked = { [weak self] reason in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.connectionState = ConnectionState.disconnected
                self.state.errorMessage = reason ?? "You were removed from the meeting"
                #if !SKIP
                HapticManager.shared.trigger(.error)
                #endif
                await self.cleanup()
            }
        }

        // Host ended the meeting (admin:endRoom) — the SFU emits roomEnded then
        // disconnects everyone. Mirror onKicked: terminal state + notice, no
        // reconnect (cleanup tears the socket down).
        socketManager.onRoomEnded = { [weak self] message in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.connectionState = ConnectionState.disconnected
                self.state.errorMessage = message ?? "The host ended the meeting"
                #if !SKIP
                HapticManager.shared.trigger(.error)
                #endif
                await self.cleanup()
            }
        }

        socketManager.onUserJoined = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                let userId = notification.userId
                if self.state.participants[userId] == nil {
                    self.state.participants[userId] = Participant(id: userId)
                }
                if let displayName = notification.displayName, !displayName.isEmpty {
                    self.state.displayNames[userId] = displayName
                }
                if let isGhost = notification.isGhost {
                    self.state.participants[userId]?.isGhost = isGhost
                }
            }
        }
        
        socketManager.onUserLeft = { [weak self] userId in
            Task { @MainActor in
                guard let self = self else { return }
                
                // Mark as leaving for animation
                self.state.participants[userId]?.isLeaving = true
                
                // Remove after animation delay
                try? await Task.sleep(nanoseconds: 200_000_000)
                self.state.participants.removeValue(forKey: userId)
                self.state.displayNames.removeValue(forKey: userId)
                
                // Cleanup video track
                self.webRTCClient.closeConsumer(producerId: "", userId: userId)
            }
        }
        
        socketManager.onDisplayNameSnapshot = { [weak self] snapshot in
            Task { @MainActor in
                guard let self = self else { return }
                var next: [String: String] = [:]
                for user in snapshot.users {
                    if let displayName = user.displayName, !displayName.isEmpty {
                        next[user.userId] = displayName
                        if user.userId == self.state.userId {
                            self.state.displayName = displayName
                        }
                    }
                }
                self.state.displayNames = next
            }
        }
        
        socketManager.onDisplayNameUpdated = { [weak self] update in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.displayNames[update.userId] = update.displayName
                if update.userId == self.state.userId {
                    self.state.displayName = update.displayName
                }
            }
        }
        
        socketManager.onNewProducer = { [weak self] producer in
            Task { @MainActor in
                guard let self = self else { return }
                
                self.handleProducerState(producer)
                
                // Consume the new producer
                do {
                    try await self.webRTCClient.consumeProducer(
                        producerId: producer.producerId,
                        producerUserId: producer.producerUserId,
                        producerType: producer.type
                    )
                } catch {
                    debugLog("[Meeting] Failed to consume producer: \(error)")
                }
            }
        }
        
        socketManager.onProducerClosed = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                
                let producerId = notification.producerId
                let userId = notification.producerUserId
                
                if let userId {
                    if self.state.activeScreenShareUserId == userId {
                        self.state.activeScreenShareUserId = nil
                    }
                    self.state.participants[userId]?.isScreenSharing = false
                }
                
                self.webRTCClient.closeConsumer(producerId: producerId, userId: userId ?? "")
            }
        }
        
        socketManager.onChatMessage = { [weak self] message in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.chatMessages.append(message)
                if !self.state.isChatOpen {
                    self.state.unreadChatCount += 1
                }
            }
        }

        socketManager.onChatHistorySnapshot = { [weak self] messages in
            Task { @MainActor in
                guard let self = self else { return }
                var existingIds = Set(self.state.chatMessages.map { $0.id })
                for message in messages where !existingIds.contains(message.id) {
                    existingIds.insert(message.id)
                    self.state.chatMessages.append(message)
                }
                self.state.chatMessages.sort { $0.timestamp < $1.timestamp }
            }
        }

        socketManager.onReaction = { [weak self] reaction in
            Task { @MainActor in
                guard let self = self else { return }
                self.handleReaction(reaction)
            }
        }
        
        socketManager.onHandRaised = { [weak self] userId, raised in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.participants[userId]?.isHandRaised = raised
                if userId == self.state.userId {
                    self.state.isHandRaised = raised
                }
            }
        }
        
        socketManager.onHandRaisedSnapshot = { [weak self] snapshot in
            Task { @MainActor in
                guard let self = self else { return }
                for entry in snapshot.users {
                    if entry.userId == self.state.userId {
                        self.state.isHandRaised = entry.raised
                    } else {
                        if self.state.participants[entry.userId] == nil {
                            self.state.participants[entry.userId] = Participant(id: entry.userId)
                        }
                        self.state.participants[entry.userId]?.isHandRaised = entry.raised
                    }
                }
            }
        }
        
        socketManager.onParticipantMuted = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                if self.state.participants[notification.userId] == nil {
                    self.state.participants[notification.userId] = Participant(id: notification.userId)
                }
                self.state.participants[notification.userId]?.isMuted = notification.muted
            }
        }

        socketManager.onParticipantCameraOff = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                if self.state.participants[notification.userId] == nil {
                    self.state.participants[notification.userId] = Participant(id: notification.userId)
                }
                self.state.participants[notification.userId]?.isCameraOff = notification.cameraOff
            }
        }
        
        socketManager.onRoomLockChanged = { [weak self] locked in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isRoomLocked = locked
            }
        }

        socketManager.onChatLockChanged = { [weak self] locked in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isChatLocked = locked
            }
        }

        socketManager.onNoGuestsChanged = { [weak self] noGuests in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isNoGuests = noGuests
            }
        }

        socketManager.onDmStateChanged = { [weak self] enabled in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isDmEnabled = enabled
            }
        }

        socketManager.onTtsDisabledChanged = { [weak self] disabled in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isTtsDisabled = disabled
            }
        }

        socketManager.onUserRequestedJoin = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.pendingUsers[notification.userId] = notification.displayName
            }
        }
        
        socketManager.onPendingUsersSnapshot = { [weak self] snapshot in
            Task { @MainActor in
                guard let self = self else { return }
                var next: [String: String] = [:]
                for user in snapshot.users {
                    next[user.userId] = user.displayName ?? user.userId
                }
                self.state.pendingUsers = next
            }
        }
        
        socketManager.onPendingUserChanged = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.pendingUsers.removeValue(forKey: notification.userId)
            }
        }
        
        socketManager.onSetVideoQuality = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.videoQuality = notification.quality
                self.webRTCClient.updateVideoQuality(notification.quality)
            }
        }
        
        socketManager.onRedirect = { [weak self] notification in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.connectionState = ConnectionState.error
                self.state.errorMessage = "You were redirected to another room: \(notification.newRoomId)"
                await self.cleanup()
            }
        }
    }
    
    // MARK: - WebRTC Bindings
    
    func setupWebRTCBindings() {
        // Observe local video state changes
        webRTCClient.onLocalVideoEnabledChanged = { [weak self] enabled in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isCameraOff = !enabled
            }
        }

        webRTCClient.onLocalAudioEnabledChanged = { [weak self] enabled in
            Task { @MainActor in
                guard let self = self else { return }
                self.state.isMuted = !enabled
            }
        }
    }
    
    // MARK: - Helper Methods
    
    func handleProducerState(_ producer: ProducerInfo) {
        // Ensure participant exists
        if state.participants[producer.producerUserId] == nil {
            state.participants[producer.producerUserId] = Participant(id: producer.producerUserId)
        }
        
        if producer.kind == "audio" {
            state.participants[producer.producerUserId]?.isMuted = producer.paused ?? false
        } else if producer.kind == "video" {
            if producer.type == "screen" {
                if let previous = state.activeScreenShareUserId, previous != producer.producerUserId {
                    state.participants[previous]?.isScreenSharing = false
                }
                state.participants[producer.producerUserId]?.isScreenSharing = true
                state.activeScreenShareUserId = producer.producerUserId
            } else {
                state.participants[producer.producerUserId]?.isCameraOff = producer.paused ?? false
            }
        }
    }
    
    func handleReaction(_ reaction: Reaction) {
        var newReaction = reaction
        newReaction.lane = reactionLaneCounter % 5
        reactionLaneCounter += 1
        
        state.activeReactions.append(newReaction)
        
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            await MainActor.run {
                self.state.activeReactions.removeAll { $0.id == reaction.id }
            }
        }
    }
    
    // MARK: - Room Actions
    
    func joinRoom(roomId: String, displayName: String, isGhost: Bool = false, user: SfuJoinUser? = nil, isHost: Bool = false) {
        self.state.roomId = roomId
        self.state.displayName = displayName
        self.state.isGhostMode = isGhost
        self.state.isAdmin = isHost
        self.state.waitingMessage = nil
        // Clear any error left over from a prior session on THIS reused singleton
        // VM (e.g. a kick / room-ended notice, or a transient in-call error).
        // cleanup() deliberately preserves errorMessage so the .error screens
        // (ErrorView) still show it after teardown — so the fresh-join path is
        // where we wipe it, or it would leak into the next meeting's banner.
        self.state.errorMessage = nil
        self.isIntentionalLeave = false
        self.shouldRejoinAfterReconnect = false
        
        let userPayload = user
        let userKey = user?.email ?? user?.id ?? "guest-\(state.sessionId)"
        self.state.userId = "\(userKey)#\(state.sessionId)"
        self.lastJoinContext = JoinContext(
            roomId: roomId,
            displayName: displayName,
            isGhost: isGhost,
            isHost: isHost,
            user: userPayload
        )
        
        state.connectionState = ConnectionState.connecting
        
        Task {
            do {
                let clientId = SfuJoinService.resolveClientId()
                let joinInfo = try await SfuJoinService.fetchJoinInfo(
                    roomId: roomId,
                    sessionId: state.sessionId,
                    user: userPayload,
                    isHost: isHost,
                    clientId: clientId,
                    // A host starting a NEW meeting must be allowed to create the room.
                    allowRoomCreation: isHost
                )
                // TEMP rig: the join API returns http://localhost:3031; on an
                // Android device that resolves to the Mac's SFU via
                // `adb reverse tcp:3031 tcp:3031`. iOS simulator reaches it
                // directly. DO NOT COMMIT (prod returns a real SFU URL).
                let sfuUrl = joinInfo.sfuUrl
                let token = joinInfo.token

                try await socketManager.connect(sfuURL: sfuUrl, token: token)
                
                let response = try await socketManager.joinRoom(
                    roomId: roomId,
                    sessionId: state.sessionId,
                    displayName: state.displayName,
                    isGhost: isGhost
                )
                
                if response.status == "waiting" {
                    state.connectionState = ConnectionState.waiting
                }
                // If status is nil or "joined", the onJoinedRoom callback handles it
                
            } catch {
                state.connectionState = ConnectionState.error
                state.errorMessage = error.localizedDescription
                #if !SKIP
                HapticManager.shared.trigger(.error)
                #endif
            }
        }
    }

    func rejoinIfPossible() async {
        guard let context = lastJoinContext, shouldRejoinAfterReconnect, !isIntentionalLeave else { return }
        if isRejoinInFlight { return }
        isRejoinInFlight = true
        shouldRejoinAfterReconnect = false
        await MainActor.run {
            self.state.connectionState = ConnectionState.joining
        }
        joinRoom(
            roomId: context.roomId,
            displayName: context.displayName,
            isGhost: context.isGhost,
            user: context.user,
            isHost: context.isHost
        )
        isRejoinInFlight = false
    }

    func forceRejoinWithFreshToken() async {
        guard !isIntentionalLeave else { return }
        shouldRejoinAfterReconnect = true
        socketManager.disconnect()
        await rejoinIfPossible()
    }
    
    // MARK: - Active Speaker Poll

    /// Starts the ~400ms poll that reads remote audio levels and updates
    /// `state.activeSpeakerId`. Idempotent — a running poll is cancelled first.
    func startActiveSpeakerPoll() {
        activeSpeakerTask?.cancel()
        // @MainActor so the poll (which iterates the WebRTC client's consumers +
        // mutates the freeze-watchdog state) is serialized with consume/close on
        // both platforms — on Android a plain Task would run off-main and could
        // race the consumer maps.
        activeSpeakerTask = Task { @MainActor [weak self] in
            var freezeTick = 0
            var syncTick = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 400_000_000)
                if Task.isCancelled { return }
                guard let self = self else { return }
                self.updateActiveSpeaker()
                // Run the video freeze watchdog ~every 2s (every 5th 400ms tick):
                // un-freezes a stuck remote decoder via a keyframe request.
                freezeTick += 1
                if freezeTick >= 5 {
                    freezeTick = 0
                    await self.webRTCClient.checkVideoFreezes()
                }
                // Producer-sync safety net ~every 10s (every 25th tick): recover
                // a consumer the SFU left paused after a dropped resumeConsumer
                // ack (the "can't hear one specific person" case).
                syncTick += 1
                if syncTick >= 25 {
                    syncTick = 0
                    await self.syncProducers()
                }
            }
        }
    }

    /// Periodic safety net mirroring the web client's producer sync: reconcile
    /// against the SFU's current producer list and re-assert resume on every
    /// live (non-paused) remote producer we already consume. The SFU's
    /// resumeConsumer is a no-op when the consumer is already resumed, so this is
    /// cheap — but it recovers a consumer stranded server-paused by a dropped
    /// ack, which otherwise stays silent for the rest of the call. No keyframe
    /// request here (the freeze watchdog handles stuck video); this targets the
    /// audio "can't hear them even though they're unmuted" case.
    private func syncProducers() async {
        guard state.connectionState == ConnectionState.joined else { return }
        let response: GetProducersResponse
        do {
            response = try await socketManager.getProducers()
        } catch {
            return
        }
        for producer in response.producers {
            if producer.paused == true { continue }
            guard let consumerId = webRTCClient.consumerId(forProducer: producer.producerId) else { continue }
            try? await socketManager.resumeConsumer(consumerId: consumerId, requestKeyFrame: false)
        }
    }

    func stopActiveSpeakerPoll() {
        activeSpeakerTask?.cancel()
        activeSpeakerTask = nil
        lastActiveSpeakerId = nil
        lastActiveSpeakerAt = nil
    }

    /// Picks the loudest remote participant above `activeSpeakerThreshold`. When
    /// nobody is above the threshold the previous speaker lingers for
    /// `activeSpeakerHoldSeconds` to debounce the ring, then clears to nil.
    private func updateActiveSpeaker() {
        #if SKIP
        // Keep the Picture-in-Picture window pointed at whoever is talking.
        updatePipVideo()
        #endif
        let levels = webRTCClient.sampleAudioLevels()

        var loudestId: String?
        var maxLevel = activeSpeakerThreshold
        for (userId, level) in levels {
            // Only ring a participant the UI knows about and isn't server-muted.
            guard let participant = state.participants[userId], !participant.isMuted else {
                continue
            }
            if level > maxLevel {
                maxLevel = level
                loudestId = participant.id
            }
        }

        let now = Date()

        if let loudestId = loudestId {
            lastActiveSpeakerId = loudestId
            lastActiveSpeakerAt = now
            if state.activeSpeakerId != loudestId {
                state.activeSpeakerId = loudestId
            }
            return
        }

        if let lingeringId = lastActiveSpeakerId,
           let since = lastActiveSpeakerAt,
           now.timeIntervalSince(since) < activeSpeakerHoldSeconds {
            if state.activeSpeakerId != lingeringId {
                state.activeSpeakerId = lingeringId
            }
            return
        }

        lastActiveSpeakerId = nil
        lastActiveSpeakerAt = nil
        if state.activeSpeakerId != nil {
            state.activeSpeakerId = nil
        }
    }

    func startProducing() async {
        // Start audio first (usually faster)
        if !state.isMuted {
            do {
                try await webRTCClient.startProducingAudio()
            } catch {
                debugLog("[Meeting] Failed to start audio: \(error)")
            }
        }
        
        // Start video if enabled
        if !state.isCameraOff {
            do {
                try await webRTCClient.startProducingVideo()
            } catch {
                debugLog("[Meeting] Failed to start video: \(error)")
            }
        }
    }
    
    func leaveRoom() {
        #if !SKIP
        HapticManager.shared.trigger(.light)
        #endif
        Task {
            isIntentionalLeave = true
            shouldRejoinAfterReconnect = false
            await cleanup()
            socketManager.disconnect()
            state.connectionState = ConnectionState.disconnected
        }
    }
    
    // MARK: - System Call Presence

    /// Brings up the OS-level call presence so the call survives backgrounding
    /// and gets system mute/leave controls. iOS = CallKit + audio-session
    /// interruption recovery; Android = the ongoing-call foreground service.
    /// Idempotent (guarded by the underlying managers) and gated on being in a
    /// joined call via CallSessionCoordinator.
    func activateCallPresence() {
        CallSessionCoordinator.shared.register(self)
        #if os(iOS) && !SKIP
        CallAudioSession.shared.begin()
        CallKitManager.shared.reportCallStarted(title: state.roomId.isEmpty ? "Conclave meeting" : state.roomId)
        CallKitManager.shared.updateMuteState(muted: state.isMuted)
        #endif
        #if SKIP
        // Android: route the notification + PiP Leave/Mute actions back into
        // this VM (hopped to the main thread by the dispatcher).
        CallActionDispatcher.register(
            mute: { self.toggleMute() },
            leave: { self.leaveRoom() }
        )
        // Start the ongoing-call foreground service (microphone + mediaPlayback)
        // so the OS keeps the call alive in the background, with a Leave + Mute
        // notification that deep-links back to the meeting.
        CallNotificationBridge.startCall(muted: state.isMuted)
        // Arm Picture-in-Picture: MainActivity.onUserLeaveHint enters PiP only
        // while a call is active.
        PipController.setInCall(active: true)
        PipController.setMuted(value: state.isMuted)
        updatePipVideo()
        #endif
    }

    /// Tears the OS-level call presence down (left, kicked, host ended, error).
    func deactivateCallPresence() {
        CallSessionCoordinator.shared.unregister(self)
        #if os(iOS) && !SKIP
        CallKitManager.shared.reportCallEnded()
        CallAudioSession.shared.end()
        #endif
        #if SKIP
        CallActionDispatcher.clear()
        CallNotificationBridge.stopCall()
        // If the call ends while in PiP (Leave from the PiP bar, host ended,
        // kicked), collapse the PiP window back to the full-screen activity —
        // otherwise it's left showing a dead/blank tile until the user manually
        // expands it. exitPip() is a no-op when not in PiP.
        PipManager.exitPip()
        PipController.setInCall(active: false)
        #endif
    }

    /// Reflect the in-app mute state onto the system call surfaces.
    private func syncCallPresenceMute() {
        #if os(iOS) && !SKIP
        CallKitManager.shared.updateMuteState(muted: state.isMuted)
        #endif
        #if SKIP
        CallNotificationBridge.updateMuted(muted: state.isMuted)
        PipController.setMuted(value: state.isMuted)
        // If we're already in PiP, refresh the Mute/Unmute RemoteAction label.
        if PipController.inPipMode {
            PipManager.refreshActions(muted: state.isMuted)
        }
        #endif
    }

    #if SKIP
    /// Pushes the active speaker's (or local, when nobody else is talking) video
    /// track to the Picture-in-Picture window. Called on each active-speaker poll
    /// tick so PiP always shows whoever is talking.
    private func updatePipVideo() {
        guard PipController.isInCall else { return }
        // Prefer the active speaker; fall back to the local user so PiP is never
        // blank when nobody else is talking.
        let targetId = state.activeSpeakerId ?? state.userId
        let isLocal = (targetId == state.userId)
        let trackId = isLocal ? "local" : targetId
        let track = webRTCClient.rawVideoTrack(userId: trackId)
        let cameraOff: Bool
        if isLocal {
            cameraOff = state.isCameraOff
        } else {
            cameraOff = state.participants[targetId]?.isCameraOff ?? true
        }
        let name = state.displayName(for: targetId)
        PipController.setPipVideo(track: track, cameraOff: cameraOff, displayName: name)
    }
    #endif

    func cleanup() async {
        deactivateCallPresence()
        stopActiveSpeakerPoll()
        #if canImport(ReplayKit) && !SKIP
        // Clear the external-stop callback BEFORE stopping: it captures this
        // (now-singleton) VM, and a late broadcast-stopped signal from a dying
        // extension could otherwise fire into the NEXT call and tear down a
        // fresh share. (handleScreenShareEndedExternally guards on
        // isScreenSharing, so this only matters if the next call is also
        // sharing — but clear it at the call boundary to be safe.)
        ScreenCaptureManager.shared.onBroadcastStopped = nil
        await ScreenCaptureManager.shared.stopCapture()
        #endif
        #if SKIP
        ScreenCaptureManager.onProjectionRevoked = nil
        ScreenCaptureManager.stopCapture()
        #endif
        await webRTCClient.cleanup()
        
        state.participants.removeAll()
        state.displayNames.removeAll()
        state.pendingUsers.removeAll()
        state.chatMessages.removeAll()
        state.activeReactions.removeAll()
        state.isHandRaised = false
        state.isScreenSharing = false
        state.activeScreenShareUserId = nil
        state.activeSpeakerId = nil
        state.pinnedUserId = nil
        state.unreadChatCount = 0
        state.waitingMessage = nil
        state.isAdmin = false
        // The VM is a process-wide singleton now (survives the PiP composition
        // swap / Activity recreation), so it's REUSED across calls. Reset every
        // session-local field here or stale room policy / chat / pin state leaks
        // into the next meeting. NOTE: do NOT clear errorMessage — the kick /
        // reject / room-ended / redirect paths set it immediately before calling
        // cleanup(), so clearing it would wipe the notice the user must see.
        state.systemMessages.removeAll()
        state.isRoomLocked = false
        state.isChatLocked = false
        state.isNoGuests = false
        state.isDmEnabled = true
        state.isTtsDisabled = false
        state.isGhostMode = false
        state.isChatOpen = false
        state.roomId = ""
        // Reset adaptive video quality: the SFU only pushes setVideoQuality when
        // a room's quality CHANGES (or is already low), so a new standard-quality
        // room may never re-raise it — leaving the reused singleton stuck at .low
        // from a previous large room.
        state.videoQuality = .standard
        lastJoinContext = nil
    }
    
    func resetError() {
        state.connectionState = ConnectionState.disconnected
        state.errorMessage = nil
        state.waitingMessage = nil
    }

    /// Clears a transient, recoverable error shown in the in-call banner WITHOUT
    /// tearing down the connection (unlike `resetError`, which returns to join).
    /// Used by the in-meeting banner overlay so a failed mute/camera/chat action
    /// surfaces visibly instead of being silently dropped while still joined.
    func dismissError() {
        state.errorMessage = nil
    }
    
    // MARK: - Media Controls
    
    func toggleMute() {
        let newState = !state.isMuted
        state.isMuted = newState
        #if !SKIP
        HapticManager.shared.trigger(.light)
        #endif
        syncCallPresenceMute()
        Task {
            if newState {
                // Muting - just pause the producer
                await webRTCClient.setAudioEnabled(false)
            } else {
                // Unmuting
                if webRTCClient.localAudioEnabled {
                    await webRTCClient.setAudioEnabled(true)
                } else {
                    // Start producing audio for the first time
                    do {
                        try await webRTCClient.startProducingAudio()
                    } catch {
                        state.isMuted = true // Revert on failure
                        state.errorMessage = error.localizedDescription
                    }
                }
            }
        }
    }
    
    func toggleCamera() {
        let newState = !state.isCameraOff
        state.isCameraOff = newState
        #if !SKIP
        HapticManager.shared.trigger(.light)
        #endif
        Task {
            if newState {
                // Turning off camera
                await webRTCClient.setVideoEnabled(false)
            } else {
                // Turning on camera
                if webRTCClient.localVideoEnabled {
                    await webRTCClient.setVideoEnabled(true)
                } else {
                    // Start producing video for the first time
                    do {
                        try await webRTCClient.startProducingVideo()
                    } catch {
                        state.isCameraOff = true // Revert on failure
                        state.errorMessage = error.localizedDescription
                    }
                }
            }
        }
    }
    
    func toggleScreenShare() {
        #if canImport(UIKit) && !SKIP
        Task {
            do {
                if state.isScreenSharing {
                    // Stop screen sharing
                    await ScreenCaptureManager.shared.stopCapture()
                    await webRTCClient.stopScreenSharing()
                    state.isScreenSharing = false
                    if state.activeScreenShareUserId == state.userId {
                        state.activeScreenShareUserId = nil
                    }
                    debugLog("[Meeting] Screen sharing stopped")
                } else {
                    try await webRTCClient.startScreenSharing()
                    // Reset the broadcast producer if the user ends the share
                    // from Control Center / the status bar instead of the
                    // in-app toggle.
                    ScreenCaptureManager.shared.onBroadcastStopped = { [weak self] in
                        self?.handleScreenShareEndedExternally()
                    }
                    // Start screen sharing (presents the system broadcast picker)
                    try await ScreenCaptureManager.shared.startCapture(webRTCClient: webRTCClient)
                    state.isScreenSharing = true
                    state.activeScreenShareUserId = state.userId
                    debugLog("[Meeting] Screen sharing started")
                }
            } catch {
                await ScreenCaptureManager.shared.stopCapture()
                await webRTCClient.stopScreenSharing()
                state.isScreenSharing = false
                state.activeScreenShareUserId = nil
                state.errorMessage = "Failed to toggle screen sharing: \(error.localizedDescription)"
                debugLog("[Meeting] Screen sharing error: \(error)")
            }
        }
        #elseif SKIP
        // Android: MediaProjection via the system consent dialog -> a
        // foreground service -> ScreenCapturerAndroid (ScreenCaptureManager is
        // the Kotlin bridge object in this same module).
        Task {
            if state.isScreenSharing {
                ScreenCaptureManager.stopCapture()
                await webRTCClient.stopScreenSharing()
                state.isScreenSharing = false
                if state.activeScreenShareUserId == state.userId {
                    state.activeScreenShareUserId = nil
                }
                debugLog("[Meeting] Screen sharing stopped")
            } else {
                // Reset state if the user stops from the system UI / notification.
                ScreenCaptureManager.onProjectionRevoked = { [weak self] in
                    self?.handleScreenShareEndedExternally()
                }
                let granted = await ScreenCaptureManager.requestCapture()
                if granted {
                    do {
                        try await webRTCClient.startScreenSharing()
                        state.isScreenSharing = true
                        state.activeScreenShareUserId = state.userId
                        debugLog("[Meeting] Screen sharing started")
                    } catch {
                        android.util.Log.e("ConclaveScreenCap", "VM startScreenSharing threw: \(error)")
                        ScreenCaptureManager.stopCapture()
                        await webRTCClient.stopScreenSharing()
                        state.isScreenSharing = false
                        state.activeScreenShareUserId = nil
                        state.errorMessage = "Failed to toggle screen sharing: \(error.localizedDescription)"
                        debugLog("[Meeting] Screen sharing error: \(error)")
                    }
                }
                // granted == false (user cancelled the consent dialog): no-op,
                // isScreenSharing stays false, no orphan producer.
            }
        }
        #else
        debugLog("[Meeting] Screen sharing not supported on this platform")
        #endif
    }

    // The screen share was ended from OUTSIDE the in-app toggle (iOS: Control
    // Center; Android: the system "Stop sharing" / notification action). Close
    // the WebRTC producer and reset state. Duplicated under the two proven Skip
    // gates (iOS + Android) because Skip mis-evaluates os()-based directives.
    #if canImport(UIKit) && !SKIP
    private func handleScreenShareEndedExternally() {
        guard state.isScreenSharing else { return }
        Task {
            await webRTCClient.stopScreenSharing()
            state.isScreenSharing = false
            if state.activeScreenShareUserId == state.userId {
                state.activeScreenShareUserId = nil
            }
            debugLog("[Meeting] Screen sharing ended externally")
        }
    }
    #endif
    #if SKIP
    private func handleScreenShareEndedExternally() {
        guard state.isScreenSharing else { return }
        Task {
            await webRTCClient.stopScreenSharing()
            state.isScreenSharing = false
            if state.activeScreenShareUserId == state.userId {
                state.activeScreenShareUserId = nil
            }
            debugLog("[Meeting] Screen sharing ended externally")
        }
    }
    #endif

    func toggleHandRaise() {
        let newState = !state.isHandRaised
        #if !SKIP
        HapticManager.shared.trigger(.medium)
        #endif
        Task {
            do {
                try await socketManager.setHandRaised(newState)
                state.isHandRaised = newState
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }
    
    func setVideoQuality(_ quality: VideoQuality) {
        state.videoQuality = quality
        webRTCClient.updateVideoQuality(quality)
    }

    // MARK: - Audio Device Routing

    func availableAudioInputs() -> [AudioDevice] {
        webRTCClient.availableAudioInputs()
    }

    func availableAudioOutputs() -> [AudioDevice] {
        webRTCClient.availableAudioOutputs()
    }

    /// The currently-selected mic input id, falling back to the platform's
    /// active route so the picker reflects reality on first open.
    func currentAudioInputId() -> String? {
        state.selectedAudioInputId ?? webRTCClient.currentAudioInputId()
    }

    func currentAudioOutputId() -> String? {
        state.selectedAudioOutputId ?? webRTCClient.currentAudioOutputId()
    }

    func setAudioInput(_ deviceId: String) {
        state.selectedAudioInputId = deviceId
        webRTCClient.selectAudioInput(deviceId)
    }

    func setAudioOutput(_ deviceId: String) {
        state.selectedAudioOutputId = deviceId
        webRTCClient.selectAudioOutput(deviceId)
    }

    func testSpeaker() {
        webRTCClient.testSpeaker()
    }
    
    // MARK: - Chat Commands
    
    func executeChatCommand(_ parsedCommand: ParsedCommand) {
        #if !SKIP
        HapticManager.shared.trigger(.medium)
        #endif
        
        Task {
            do {
                switch parsedCommand.command {
                case .raise:
                    if !state.isHandRaised {
                        try await socketManager.setHandRaised(true)
                        state.isHandRaised = true
                        addSystemMessage(.commandExecuted(command: .raise, userName: state.displayName))
                    }
                    
                case .lower:
                    if state.isHandRaised {
                        try await socketManager.setHandRaised(false)
                        state.isHandRaised = false
                        addSystemMessage(.commandExecuted(command: .lower, userName: state.displayName))
                    }
                    
                case .mute:
                    if !state.isMuted {
                        await setMuted(true)
                        addSystemMessage(.commandExecuted(command: .mute, userName: state.displayName))
                    }
                    
                case .unmute:
                    if state.isMuted {
                        await setMuted(false)
                        addSystemMessage(.commandExecuted(command: .unmute, userName: state.displayName))
                    }
                    
                case .cameraOn:
                    if state.isCameraOff {
                        await setCameraOff(false)
                        addSystemMessage(.commandExecuted(command: .cameraOn, userName: state.displayName))
                    }
                    
                case .cameraOff:
                    if !state.isCameraOff {
                        await setCameraOff(true)
                        addSystemMessage(.commandExecuted(command: .cameraOff, userName: state.displayName))
                    }

                case .help:
                    let names = ChatCommand.allCases.map { "/\($0.rawValue)" }.joined(separator: ", ")
                    addSystemMessage(.info("Available commands: \(names)"))

                case .clear:
                    state.chatMessages.removeAll()
                    state.systemMessages.removeAll()
                    addSystemMessage(.info("Chat cleared"))

                case .leave:
                    leaveRoom()
                }
            } catch {
                addSystemMessage(.commandFailed(command: parsedCommand.command, reason: error.localizedDescription))
            }
        }
    }
    
    private func addSystemMessage(_ type: SystemMessageType) {
        let message = SystemMessage(type: type)
        state.systemMessages.append(message)
    }
    
    private func setMuted(_ muted: Bool) async {
        state.isMuted = muted
        syncCallPresenceMute()
        if muted {
            await webRTCClient.setAudioEnabled(false)
        } else {
            if webRTCClient.localAudioEnabled {
                await webRTCClient.setAudioEnabled(true)
            } else {
                do {
                    try await webRTCClient.startProducingAudio()
                } catch {
                    state.isMuted = true
                    state.errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    private func setCameraOff(_ cameraOff: Bool) async {
        state.isCameraOff = cameraOff
        if cameraOff {
            await webRTCClient.setVideoEnabled(false)
        } else {
            if webRTCClient.localVideoEnabled {
                await webRTCClient.setVideoEnabled(true)
            } else {
                do {
                    try await webRTCClient.startProducingVideo()
                } catch {
                    state.isCameraOff = true
                    state.errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    // MARK: - Chat
    
    func sendChatMessage(_ content: String) {
        guard !content.isEmpty else { return }
        if state.isChatLocked && !state.isAdmin {
            state.errorMessage = "Chat is locked by the host."
            return
        }
        
        // Check if it's a command
        if let parsedCommand = ChatCommandParser.parse(content) {
            executeChatCommand(parsedCommand)
            return
        }
        
        #if !SKIP
        HapticManager.shared.trigger(.light)
        #endif
        // Detect a "/dm <name> <message>" or "@<name> <message>" so the local
        // echo strips the prefix and shows a Private badge (web parity). The raw
        // content is still sent verbatim — the server resolves the recipient.
        let dmIntent = ChatCommandParser.parseDirectMessage(content)

        Task {
            do {
                try await socketManager.sendChat(content: content)

                // Add locally for immediate feedback
                let message = ChatMessage(
                    userId: state.userId,
                    displayName: state.displayName.isEmpty ? "You" : state.displayName,
                    content: dmIntent?.body ?? content,
                    isDirect: dmIntent != nil,
                    dmTargetDisplayName: dmIntent?.target
                )
                state.chatMessages.append(message)

            } catch {
                state.errorMessage = "Failed to send message"
            }
        }
    }
    
    func toggleChat() {
        state.isChatOpen = !state.isChatOpen
        if state.isChatOpen {
            state.unreadChatCount = 0
        }
    }
    
    // MARK: - Reactions
    
    func sendReaction(emoji: String) {
        #if !SKIP
        HapticManager.shared.trigger(.medium)
        #endif
        Task {
            do {
                try await socketManager.sendReaction(emoji: emoji, kind: "emoji", value: emoji, label: nil)

                let reaction = Reaction(userId: state.userId, kind: .emoji, value: emoji)
                handleReaction(reaction)

            } catch {
            }
        }
    }
    
    // MARK: - Admin Actions
    
    func updateDisplayName(_ name: String) {
        guard state.isAdmin else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        Task {
            do {
                try await socketManager.updateDisplayName(trimmed)
                state.displayName = trimmed
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func toggleRoomLock() {
        guard state.isAdmin else { return }
        
        Task {
            do {
                let nextLocked = !state.isRoomLocked
                try await socketManager.lockRoom(nextLocked)
                state.isRoomLocked = nextLocked
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func toggleChatLock() {
        guard state.isAdmin else { return }

        Task {
            do {
                let nextLocked = !state.isChatLocked
                try await socketManager.lockChat(nextLocked)
                state.isChatLocked = nextLocked
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func toggleNoGuests() {
        guard state.isAdmin else { return }

        Task {
            do {
                let next = !state.isNoGuests
                try await socketManager.setNoGuests(next)
                state.isNoGuests = next
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func toggleDmEnabled() {
        guard state.isAdmin else { return }

        Task {
            do {
                let next = !state.isDmEnabled
                try await socketManager.setDmEnabled(next)
                state.isDmEnabled = next
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func toggleTtsDisabled() {
        guard state.isAdmin else { return }

        Task {
            do {
                let next = !state.isTtsDisabled
                try await socketManager.setTtsDisabled(next)
                state.isTtsDisabled = next
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func admitUser(userId: String) {
        guard state.isAdmin else { return }
        
        Task {
            do {
                try await socketManager.admitUser(userId: userId)
                state.pendingUsers.removeValue(forKey: userId)
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }
    
    func removeUser(userId: String) {
        guard state.isAdmin else { return }
        
        Task {
            do {
                if state.pendingUsers[userId] != nil {
                    state.pendingUsers.removeValue(forKey: userId)
                    try await socketManager.rejectUser(userId: userId)
                } else {
                    try await socketManager.kickUser(userId: userId)
                }
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func muteParticipant(userId: String) {
        guard state.isAdmin else { return }
        Task {
            do {
                try await socketManager.muteUser(userId: userId)
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func muteAllParticipants() {
        guard state.isAdmin else { return }
        Task {
            do {
                try await socketManager.muteAll()
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func admitAllPending() {
        guard state.isAdmin else { return }
        Task {
            do {
                try await socketManager.admitAllPending()
                state.pendingUsers.removeAll()
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func rejectAllPending() {
        guard state.isAdmin else { return }
        Task {
            do {
                try await socketManager.rejectAllPending()
                state.pendingUsers.removeAll()
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    func makeHost(userId: String) {
        guard state.isAdmin else { return }
        Task {
            do {
                try await socketManager.promoteHost(userId: userId)
            } catch {
                state.errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Spotlight / Pin (local-only)

    func togglePin(_ userId: String) {
        if state.pinnedUserId == userId {
            state.pinnedUserId = nil
        } else {
            state.pinnedUserId = userId
        }
    }

    func clearPin() {
        state.pinnedUserId = nil
    }
}

#if !SKIP
extension MeetingViewModel: ObservableObject {}
#endif
