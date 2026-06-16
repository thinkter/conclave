import SwiftUI
import Observation
#if canImport(UIKit) && !SKIP
import UIKit
#endif

struct MoreSheetView: View {
    @Bindable var viewModel: MeetingViewModel
    var bodyReady: Bool = true
    let onOpenSettings: () -> Void
    let onOpenParticipants: () -> Void
    @Environment(\.dismiss) private var dismiss

    private let emojiReactions = MeetingReactionConstants.emojiReactionOptions
    private let assetReactions = MeetingReactionConstants.assetOptions
    private let browserLaunchOptions = BrowserLaunchOption.defaults
    private let browserLaunchColumns = [
        GridItem(.flexible(), spacing: ACMSpacing.xs),
        GridItem(.flexible(), spacing: ACMSpacing.xs)
    ]
    @State private var browserURLInput = ""

    var body: some View {
        let canUseParticipantActions = !viewModel.state.isGhostMode && !viewModel.state.isWebinarAttendee
        let canShowSharedBrowser = !viewModel.state.isWebinarAttendee &&
            (canManageSharedBrowser || viewModel.state.isBrowserActive || viewModel.state.hasBrowserAudio)

        VStack(spacing: 0) {
            MeetingSheetHeader(title: "More", onDone: { dismiss() })

            if bodyReady {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: ACMSpacing.md) {
                    VStack(alignment: .leading, spacing: ACMSpacing.xs) {
                        acmListSectionHeader("Quick reactions")

                        HStack(spacing: 0) {
                            ForEach(emojiReactions) { option in
                                Button {
                                    viewModel.sendReaction(option)
                                    dismiss()
                                } label: {
                                    Text(option.value)
                                        .font(.system(size: 26))
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 48)
#if !SKIP
                                        .contentShape(Rectangle())
#endif
                                }
                                .buttonStyle(.plain)
                                .disabled(!canUseParticipantActions)
                            }
                        }
                        .opacity(canUseParticipantActions ? 1.0 : 0.45)

                        HStack(spacing: ACMSpacing.xs) {
                            ForEach(assetReactions) { option in
                                Button {
                                    viewModel.sendReaction(option)
                                    dismiss()
                                } label: {
                                    Text(option.label)
                                        .font(ACMFont.trial(11, weight: .medium))
                                        .foregroundStyle(ACMColors.text)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.72)
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 34)
                                        .acmColorBackground(ACMColors.surfaceRaised)
                                        .clipShape(Capsule())
#if !SKIP
                                        .contentShape(Rectangle())
#endif
                                }
                                .buttonStyle(.plain)
                                .disabled(!canUseParticipantActions)
                            }
                        }
                        .opacity(canUseParticipantActions ? 1.0 : 0.45)
                    }

                    VStack(alignment: .leading, spacing: ACMSpacing.xs) {
                        acmListSectionHeader("Meeting actions")

                        MeetingSheetSectionCard {
                            MoreRow(
                                icon: viewModel.state.isHandRaised ? "hand.raised.fill" : "hand.raised",
                                androidIcon: viewModel.state.isHandRaised ? "raise.hand" : "raise.hand.off",
                                title: viewModel.state.isHandRaised ? "Lower hand" : "Raise hand",
                                tint: canUseParticipantActions
                                    ? (viewModel.state.isHandRaised ? ACMColors.handRaised : ACMColors.text)
                                    : ACMColors.textFaint,
                                androidTint: canUseParticipantActions
                                    ? (viewModel.state.isHandRaised ? "amber" : "text")
                                    : "faint",
                                isDisabled: !canUseParticipantActions
                            ) {
                                viewModel.toggleHandRaise()
                                dismiss()
                            }
                            MoreRowDivider()
                            MoreRow(icon: "message.fill", androidIcon: "chat", title: "Chat") {
                                viewModel.toggleChat()
                                dismiss()
                            }
                            MoreRowDivider()
                            MoreRow(icon: "person.2.fill", androidIcon: "participants", title: "Participants", showsChevron: true) {
                                onOpenParticipants()
                            }
                            MoreRowDivider()
                            MoreRow(icon: "person.badge.plus", androidIcon: "link", title: "Invite people") {
                                MeetingShare.shareMeetingLink(
                                    viewModel.state.meetingLink,
                                    roomId: viewModel.state.roomId
                                )
                                dismiss()
                            }
                            MoreRowDivider()
                            MoreRow(icon: "doc.on.doc", androidIcon: "copy", title: "Copy meeting link") {
                                MeetingShare.copyMeetingLink(viewModel.state.meetingLink)
                                dismiss()
                            }
                            MoreRowDivider()
                            MoreRow(icon: "gearshape.fill", androidIcon: "settings", title: "Settings", showsChevron: true) {
                                onOpenSettings()
                            }
                        }
                    }

                    viewSection

                    if canShowAdminControls {
                        adminControlsSection
                    }

                    if canShowSharedBrowser {
                        sharedBrowserSection
                    }

                    if canShowAppsSection {
                        appsSection
                    }
                }
                .padding(.horizontal, ACMSpacing.lg)
                .padding(.top, ACMSpacing.md)
                .padding(.bottom, ACMSpacing.lg)
            }
            .transition(.opacity)
            } else {
                Spacer()
            }
        }
        #if SKIP
        .frame(maxWidth: .infinity, alignment: .topLeading)
        #else
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        #endif
    }

    @ViewBuilder
    private var viewSection: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("View")

            MeetingSheetSectionCard {
                viewModeRow(.auto, icon: "rectangle.grid.2x2", androidIcon: "settings")
                MoreRowDivider()
                viewModeRow(.tiled, icon: "square.grid.2x2", androidIcon: "participants")
                MoreRowDivider()
                viewModeRow(.spotlight, icon: "rectangle.inset.filled", androidIcon: "pin.off")
                MoreRowDivider()
                viewModeRow(.sidebar, icon: "sidebar.right", androidIcon: "participants")
            }

            MeetingSheetSectionCard {
                maxTilesRow
                MoreRowDivider()
                MoreRow(
                    icon: viewModel.state.hideTilesWithoutVideo ? "video.fill" : "video.slash.fill",
                    androidIcon: viewModel.state.hideTilesWithoutVideo ? "video" : "video.off",
                    title: viewModel.state.hideTilesWithoutVideo ? "Show video-off tiles" : "Hide tiles without video",
                    tint: viewModel.state.hideTilesWithoutVideo ? ACMColors.primaryOrange : ACMColors.text,
                    androidTint: viewModel.state.hideTilesWithoutVideo ? "accent" : "text"
                ) {
                    viewModel.toggleHideTilesWithoutVideo()
                }
            }

            acmListSectionHeader("Self-view")

            MeetingSheetSectionCard {
                selfViewModeRow(.auto, icon: "rectangle.grid.2x2", androidIcon: "settings")
                MoreRowDivider()
                selfViewModeRow(.tile, icon: "person.crop.rectangle", androidIcon: "account")
                MoreRowDivider()
                selfViewModeRow(.floating, icon: "pip", androidIcon: "info")
                MoreRowDivider()
                selfViewModeRow(.minimized, icon: "minus.rectangle", androidIcon: "remove.person")
            }

            acmListSectionHeader("Self-view position")

            MeetingSheetSectionCard {
                selfViewCornerRow(.topLeft, icon: "arrow.up.left", androidIcon: "north.west")
                MoreRowDivider()
                selfViewCornerRow(.topRight, icon: "arrow.up.right", androidIcon: "north.east")
                MoreRowDivider()
                selfViewCornerRow(.bottomLeft, icon: "arrow.down.left", androidIcon: "south.west")
                MoreRowDivider()
                selfViewCornerRow(.bottomRight, icon: "arrow.down.right", androidIcon: "south.east")
            }
        }
    }

    @ViewBuilder
    private func viewModeRow(_ mode: MeetingViewMode, icon: String, androidIcon: String) -> some View {
        let isSelected = viewModel.state.viewMode == mode
        MoreRow(
            icon: isSelected ? "checkmark.circle.fill" : icon,
            androidIcon: isSelected ? "check" : androidIcon,
            title: "\(mode.title) view",
            tint: isSelected ? ACMColors.primaryOrange : ACMColors.text,
            androidTint: isSelected ? "accent" : "text"
        ) {
            viewModel.setViewMode(mode)
        }
    }

    private var maxTilesRow: some View {
        HStack(spacing: ACMSpacing.sm) {
            MeetingSheetIconBox(
                icon: "square.grid.2x2",
                androidIcon: "participants",
                tint: ACMColors.text,
                androidTint: "text",
                background: ACMColors.surfaceRaised
            )

            VStack(alignment: .leading, spacing: 2) {
                Text("Maximum tiles")
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(ACMColors.text)
                    .lineLimit(1)
                Text("\(viewModel.state.viewMaxTiles) visible")
                    .font(ACMFont.trial(12))
                    .foregroundStyle(ACMColors.textFaint)
                    .lineLimit(1)
            }

            Spacer()

            tileLimitButton(icon: "minus", androidIcon: "close", delta: -1)
            Text("\(viewModel.state.viewMaxTiles)")
                .font(ACMFont.trial(13, weight: .semibold))
                .foregroundStyle(ACMColors.text)
                .frame(minWidth: 28)
            tileLimitButton(icon: "plus", androidIcon: "add", delta: 1)
        }
        .padding(.horizontal, ACMSpacing.sm)
        .frame(height: 58)
    }

    private func tileLimitButton(icon: String, androidIcon: String, delta: Int) -> some View {
        Button {
            viewModel.adjustViewMaxTiles(by: delta)
        } label: {
            ACMSystemIcon.icon(icon, android: androidIcon, size: 14, tint: "text")
                .foregroundStyle(ACMColors.text)
                .frame(width: 30, height: 30)
                .acmColorBackground(ACMColors.surfaceRaised)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func selfViewModeRow(_ mode: MeetingSelfViewMode, icon: String, androidIcon: String) -> some View {
        let isSelected = viewModel.state.selfViewMode == mode
        MoreRow(
            icon: isSelected ? "checkmark.circle.fill" : icon,
            androidIcon: isSelected ? "check" : androidIcon,
            title: mode.title,
            tint: isSelected ? ACMColors.primaryOrange : ACMColors.text,
            androidTint: isSelected ? "accent" : "text"
        ) {
            viewModel.setSelfViewMode(mode)
        }
    }

    @ViewBuilder
    private func selfViewCornerRow(_ corner: MeetingSelfViewCorner, icon: String, androidIcon: String) -> some View {
        let isSelected = viewModel.state.selfViewCorner == corner
        MoreRow(
            icon: isSelected ? "checkmark.circle.fill" : icon,
            androidIcon: isSelected ? "check" : androidIcon,
            title: corner.title,
            tint: isSelected ? ACMColors.primaryOrange : ACMColors.text,
            androidTint: isSelected ? "accent" : "text"
        ) {
            viewModel.setSelfViewCorner(corner)
        }
    }

    @ViewBuilder
    private var sharedBrowserSection: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Shared browser")

            MeetingSheetSectionCard {
                if viewModel.state.isBrowserActive {
                    HStack(spacing: ACMSpacing.sm) {
                        MeetingSheetIconBox(
                            icon: "globe",
                            androidIcon: "public",
                            tint: ACMColors.primaryOrange,
                            androidTint: "accent",
                            background: ACMColors.surfaceRaised
                        )

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Shared browser active")
                                .font(ACMFont.trial(15, weight: .medium))
                                .foregroundStyle(ACMColors.text)
                                .lineLimit(1)
                            Text(viewModel.state.browserURL ?? "Browser session running")
                                .font(ACMFont.trial(12))
                                .foregroundStyle(ACMColors.textFaint)
                                .lineLimit(1)
                        }

                        Spacer()
                    }
                    .padding(.horizontal, ACMSpacing.sm)
                    .frame(height: 56)

                    if viewModel.state.hasBrowserAudio || viewModel.state.isBrowserActive {
                        MoreRowDivider()
                        browserAudioRow
                    }

                    if canManageSharedBrowser {
                        MoreRowDivider()

                        MoreRow(
                            icon: "xmark",
                            androidIcon: "close",
                            title: "Close shared browser",
                            tint: ACMColors.error,
                            androidTint: "error"
                        ) {
                            viewModel.closeSharedBrowser()
                        }
                    }
                } else if canManageSharedBrowser {
                    HStack(spacing: ACMSpacing.sm) {
                        MeetingSheetIconBox(
                            icon: "globe",
                            androidIcon: "public",
                            tint: ACMColors.textMuted,
                            androidTint: "muted",
                            background: ACMColors.surfaceRaised
                        )

                        TextField("", text: $browserURLInput, prompt: Text("example.com").foregroundStyle(ACMColors.textFaint))
                            .textFieldStyle(.plain)
                            .font(ACMFont.trial(15))
                            .foregroundStyle(ACMColors.text)
                            .tint(ACMColors.primaryOrange)
#if !SKIP
#if os(iOS)
                            .textInputAutocapitalization(.never)
#endif
#endif
                            .autocorrectionDisabled(true)
                    }
                    .padding(.horizontal, ACMSpacing.sm)
                    .frame(height: 52)

                    MoreRowDivider()

                    LazyVGrid(columns: browserLaunchColumns, spacing: ACMSpacing.xs) {
                        ForEach(browserLaunchOptions) { option in
                            Button {
                                viewModel.launchSharedBrowser(url: option.url)
                                dismiss()
                            } label: {
                                Text(option.name)
                                    .font(ACMFont.trial(13, weight: .medium))
                                    .foregroundStyle(ACMColors.text)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.78)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 36)
                                    .acmColorBackground(ACMColors.surfaceRaised)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    #if !SKIP
                                    .contentShape(Rectangle())
                                    #endif
                            }
                            .buttonStyle(.plain)
                            .disabled(viewModel.state.isBrowserLaunching)
                        }
                    }
                    .padding(.horizontal, ACMSpacing.sm)
                    .padding(.vertical, ACMSpacing.sm)
                    .opacity(viewModel.state.isBrowserLaunching ? 0.45 : 1.0)

                    MoreRowDivider()

                    MoreRow(
                        icon: "play.fill",
                        androidIcon: "public",
                        title: viewModel.state.isBrowserLaunching ? "Launching..." : "Launch shared browser",
                        tint: canLaunchSharedBrowser ? ACMColors.text : ACMColors.textFaint,
                        androidTint: canLaunchSharedBrowser ? "text" : "faint",
                        isDisabled: !canLaunchSharedBrowser
                    ) {
                        viewModel.launchSharedBrowser(url: browserURLInput)
                    }
                } else if viewModel.state.hasBrowserAudio {
                    browserAudioRow
                }
            }
        }
    }

    private var browserAudioRow: some View {
        MoreRow(
            icon: viewModel.state.isBrowserAudioMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
            androidIcon: viewModel.state.isBrowserAudioMuted ? "volume.off" : "volume",
            title: viewModel.state.isBrowserAudioMuted ? "Unmute browser audio" : "Mute browser audio",
            tint: viewModel.state.isBrowserAudioMuted ? ACMColors.primaryOrange : ACMColors.text,
            androidTint: viewModel.state.isBrowserAudioMuted ? "accent" : "text"
        ) {
            viewModel.toggleBrowserAudio()
            dismiss()
        }
    }

    private var canLaunchSharedBrowser: Bool {
        !viewModel.state.isBrowserLaunching &&
        !browserURLInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var canManageSharedBrowser: Bool {
        viewModel.state.isAdmin && !viewModel.state.isWebinarAttendee
    }

    @ViewBuilder
    private var adminControlsSection: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Admin controls")

            MeetingSheetSectionCard {
                MoreRow(
                    icon: viewModel.state.isRoomLocked ? "lock.open.fill" : "lock.fill",
                    androidIcon: viewModel.state.isRoomLocked ? "lock.open" : "lock",
                    title: viewModel.state.isRoomLocked ? "Unlock meeting" : "Lock meeting",
                    tint: viewModel.state.isRoomLocked ? ACMColors.primaryOrange : ACMColors.text,
                    androidTint: viewModel.state.isRoomLocked ? "accent" : "text"
                ) {
                    viewModel.toggleRoomLock()
                    dismiss()
                }

                MoreRowDivider()

                MoreRow(
                    icon: "nosign",
                    androidIcon: "block",
                    title: viewModel.state.isNoGuests ? "Allow guests" : "Block guests",
                    tint: viewModel.state.isNoGuests ? ACMColors.primaryOrange : ACMColors.text,
                    androidTint: viewModel.state.isNoGuests ? "accent" : "text"
                ) {
                    viewModel.toggleNoGuests()
                    dismiss()
                }

                MoreRowDivider()

                MoreRow(
                    icon: viewModel.state.isChatLocked ? "message.fill" : "message.badge.fill",
                    androidIcon: "chat",
                    title: viewModel.state.isChatLocked ? "Enable chat" : "Disable chat",
                    tint: viewModel.state.isChatLocked ? ACMColors.primaryOrange : ACMColors.text,
                    androidTint: viewModel.state.isChatLocked ? "accent" : "text"
                ) {
                    viewModel.toggleChatLock()
                    dismiss()
                }

                MoreRowDivider()

                MoreRow(
                    icon: viewModel.state.isTtsDisabled ? "speaker.wave.2.fill" : "speaker.slash.fill",
                    androidIcon: viewModel.state.isTtsDisabled ? "volume" : "volume.off",
                    title: viewModel.state.isTtsDisabled ? "Enable TTS" : "Disable TTS",
                    tint: viewModel.state.isTtsDisabled ? ACMColors.primaryOrange : ACMColors.text,
                    androidTint: viewModel.state.isTtsDisabled ? "accent" : "text"
                ) {
                    viewModel.toggleTtsDisabled()
                    dismiss()
                }

                MoreRowDivider()

                MoreRow(
                    icon: viewModel.state.isDmEnabled ? "message.fill" : "message.slash.fill",
                    androidIcon: "chat",
                    title: viewModel.state.isDmEnabled ? "Disable DMs" : "Enable DMs",
                    tint: viewModel.state.isDmEnabled ? ACMColors.text : ACMColors.primaryOrange,
                    androidTint: viewModel.state.isDmEnabled ? "text" : "accent"
                ) {
                    viewModel.toggleDmEnabled()
                    dismiss()
                }
            }
        }
    }

    @ViewBuilder
    private var appsSection: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Apps")

            MeetingSheetSectionCard {
                if let activeAppName = viewModel.state.activeAppName {
                    HStack(spacing: ACMSpacing.sm) {
                        MeetingSheetIconBox(
                            icon: "pencil",
                            androidIcon: "forum",
                            tint: ACMColors.primaryOrange,
                            androidTint: "accent",
                            background: ACMColors.surfaceRaised
                        )

                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(activeAppName) active")
                                .font(ACMFont.trial(15, weight: .medium))
                                .foregroundStyle(ACMColors.text)
                                .lineLimit(1)
                            Text(viewModel.state.isAppsLocked ? "Editing locked" : "Editing open")
                                .font(ACMFont.trial(12))
                                .foregroundStyle(ACMColors.textFaint)
                                .lineLimit(1)
                        }

                        Spacer()
                    }
                    .padding(.horizontal, ACMSpacing.sm)
                    .frame(height: 56)

                    if canManageActiveApp {
                        MoreRowDivider()
                    }
                }

                if canManageApps {
                    MoreRow(
                        icon: viewModel.state.isWhiteboardActive ? "xmark" : "pencil",
                        androidIcon: viewModel.state.isWhiteboardActive ? "close" : "forum",
                        title: viewModel.state.isWhiteboardActive ? "Close whiteboard" : "Open whiteboard",
                        tint: viewModel.state.isWhiteboardActive ? ACMColors.error : ACMColors.text,
                        androidTint: viewModel.state.isWhiteboardActive ? "error" : "text",
                        isDisabled: viewModel.state.isAppsActionInFlight
                    ) {
                        if viewModel.state.isWhiteboardActive {
                            viewModel.closeActiveApp()
                        } else {
                            viewModel.openWhiteboard()
                        }
                        dismiss()
                    }

                    #if DEBUG
                    if canManageDevPlayground {
                        MoreRowDivider()

                        MoreRow(
                            icon: viewModel.state.activeAppId == "dev-playground" ? "xmark" : "chevron.left.forwardslash.chevron.right",
                            androidIcon: viewModel.state.activeAppId == "dev-playground" ? "close" : "info",
                            title: viewModel.state.activeAppId == "dev-playground" ? "Close dev playground" : "Open dev playground",
                            tint: viewModel.state.activeAppId == "dev-playground" ? ACMColors.error : ACMColors.text,
                            androidTint: viewModel.state.activeAppId == "dev-playground" ? "error" : "text",
                            isDisabled: viewModel.state.isAppsActionInFlight
                        ) {
                            if viewModel.state.activeAppId == "dev-playground" {
                                viewModel.closeActiveApp()
                            } else {
                                viewModel.openDevPlayground()
                            }
                            dismiss()
                        }
                    }
                    #endif

                    if canManageUnknownActiveApp {
                        MoreRowDivider()

                        MoreRow(
                            icon: "xmark",
                            androidIcon: "close",
                            title: "Close \(viewModel.state.activeAppName ?? "app")",
                            tint: ACMColors.error,
                            androidTint: "error",
                            isDisabled: viewModel.state.isAppsActionInFlight
                        ) {
                            viewModel.closeActiveApp()
                            dismiss()
                        }
                    }
                }

                if canManageApps {
                    MoreRowDivider()

                    MoreRow(
                        icon: viewModel.state.isAppsLocked ? "lock.open.fill" : "lock.fill",
                        androidIcon: viewModel.state.isAppsLocked ? "lock.open" : "lock",
                        title: viewModel.state.isAppsLocked ? "Unlock app editing" : "Lock app editing",
                        tint: viewModel.state.isAppsLocked ? ACMColors.primaryOrange : ACMColors.text,
                        androidTint: viewModel.state.isAppsLocked ? "accent" : "text",
                        isDisabled: viewModel.state.isAppsActionInFlight
                    ) {
                        viewModel.toggleAppsLock()
                        dismiss()
                    }
                }
            }
        }
    }

    private var canManageApps: Bool {
        viewModel.state.isAdmin && !viewModel.state.isWebinarAttendee
    }

    private var canManageActiveApp: Bool {
        canManageApps && viewModel.state.activeAppId != nil
    }

    private var canManageUnknownActiveApp: Bool {
        guard canManageActiveApp, let activeAppId = viewModel.state.activeAppId else { return false }
        return activeAppId != "whiteboard" && activeAppId != "dev-playground"
    }

    private var canManageDevPlayground: Bool {
        #if DEBUG
        return canManageApps
        #else
        return false
        #endif
    }

    private var canShowAdminControls: Bool {
        viewModel.state.isAdmin && !viewModel.state.isWebinarAttendee
    }

    private var canShowAppsSection: Bool {
        canManageApps || viewModel.state.activeAppId != nil
    }
}

private struct BrowserLaunchOption: Identifiable {
    let id: String
    let name: String
    let url: String

    static let defaults = [
        BrowserLaunchOption(id: "figma", name: "Figma", url: "https://www.figma.com"),
        BrowserLaunchOption(id: "miro", name: "Miro", url: "https://miro.com"),
        BrowserLaunchOption(id: "notion", name: "Notion", url: "https://www.notion.so"),
        BrowserLaunchOption(id: "google-docs", name: "Docs", url: "https://docs.google.com"),
        BrowserLaunchOption(id: "trello", name: "Trello", url: "https://trello.com"),
        BrowserLaunchOption(id: "youtube", name: "YouTube", url: "https://www.youtube.com"),
        BrowserLaunchOption(id: "loom", name: "Loom", url: "https://www.loom.com")
    ]
}

struct MoreRow: View {
    let icon: String
    let androidIcon: String
    let title: String
    var tint: Color = ACMColors.text
    var androidTint: String = "text"
    var showsChevron: Bool = false
    var isDisabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: icon,
                    androidIcon: androidIcon,
                    tint: tint,
                    androidTint: androidTint,
                    background: ACMColors.surfaceRaised
                )

                Text(title)
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(tint)
                    .lineLimit(1)

                Spacer()

                if showsChevron {
                    ACMSystemIcon.icon("chevron.right", android: "arrow.forward", size: 16, tint: "faint")
                        .foregroundStyle(ACMColors.textFaint)
                        .frame(width: 24, height: 24)
                }
            }
            .padding(.horizontal, ACMSpacing.sm)
            .frame(height: 52)
            .frame(maxWidth: .infinity, alignment: .leading)
            #if !SKIP
            .contentShape(Rectangle())
            #endif
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.55 : 1.0)
    }
}

struct MoreRowDivider: View {
    var body: some View {
        MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
    }
}
