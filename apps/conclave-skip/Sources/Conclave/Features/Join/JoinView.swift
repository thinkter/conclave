//
//  JoinView.swift
//  Conclave
//
//  Join screen
//

import SwiftUI
import Foundation
import Observation
#if canImport(UIKit)
import UIKit
#endif
#if SKIP
#else
import AVFoundation
#endif

struct JoinView: View {
    @Bindable var viewModel: MeetingViewModel
    @Bindable var appState: AppState
    
    @State private var phase: JoinPhase = .welcome
    @State private var roomCode = ""
    @State private var guestName = ""
    @State private var displayNameInput = ""
    @State private var isGhostMode = false
    @State private var activeTab: JoinTab = .new
    @State private var isCameraOn = false
    @State private var isMicOn = false
    @State private var isSigningIn = false
#if SKIP
#else
    @State private var captureSession: AVCaptureSession?
#endif
    
    enum JoinPhase {
        case welcome, auth, join
    }
    
    enum JoinTab {
        case new, join
    }

    private var isGoogleSignInEnabled: Bool {
        let env = ProcessInfo.processInfo.environment
        if let value = env["GOOGLE_SIGN_IN_ENABLED"]?.lowercased() {
            return value == "1" || value == "true" || value == "yes"
        }
        if let plistBool = Bundle.main.object(forInfoDictionaryKey: "GOOGLE_SIGN_IN_ENABLED") as? Bool {
            return plistBool
        }
        if let plistString = Bundle.main.object(forInfoDictionaryKey: "GOOGLE_SIGN_IN_ENABLED") as? String {
            let normalized = plistString.lowercased()
            return normalized == "1" || normalized == "true" || normalized == "yes"
        }
        return false
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ACMColors.darkAlt
                    .ignoresSafeArea()
                
                dotGridPattern
                    .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    switch phase {
                    case .welcome:
                        welcomePhase
                            .transition(.opacity)
                        
                    case .auth:
                        authPhase
                            .transition(.asymmetric(
                                insertion: .move(edge: .bottom).combined(with: .opacity),
                                removal: .opacity
                            ))
                        
                    case .join:
                        joinPhase(geometry: geometry)
                            .transition(.opacity)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                
                if viewModel.state.connectionState == ConnectionState.connecting || viewModel.state.connectionState == ConnectionState.joining {
                    loadingOverlay
                }
            }
        }
        .animation(.easeOut(duration: 0.4), value: phase)
        .onAppear {
            if let user = appState.currentUser, !user.id.hasPrefix("guest-") {
                phase = .join
            }
        }
    }
    
    // MARK: - Welcome Phase
    
    private var welcomePhase: some View {
        VStack(spacing: 0) {
            Spacer()
            
            Text("welcome to")
                .font(ACMFont.wide(24))
                .foregroundStyle(ACMColors.creamDim)
                .tracking(2)
                .padding(EdgeInsets(top: 0, leading: 0, bottom: 8, trailing: 0))
            
            HStack(spacing: 0) {
                Text("[")
                    .font(ACMFont.mono(36))
                    .foregroundStyle(acmColor(red: 249.0, green: 95.0, blue: 74.0, opacity: 0.4))
                
                Text("c0nclav3")
                    .font(ACMFont.wide(48))
                    .foregroundStyle(ACMColors.cream)
                    .tracking(-1)
                
                Text("]")
                    .font(ACMFont.mono(36))
                    .foregroundStyle(acmColor(red: 249.0, green: 95.0, blue: 74.0, opacity: 0.4))
            }
            
            Text("ACM-VIT's in-house video conferencing platform")
                .font(ACMFont.trial(14))
                .foregroundStyle(ACMColors.creamMuted)
                .padding(EdgeInsets(top: 16, leading: 0, bottom: 0, trailing: 0))
                .padding(EdgeInsets(top: 0, leading: 0, bottom: 48, trailing: 0))
            
            Button {
                phase = .auth
            } label: {
                HStack(spacing: 12) {
                    Text("LET'S GO")
                        .font(ACMFont.mono(12))
                        .tracking(3)
                    
                    ACMSystemIcon.image("arrow.forward", androidName: "Icons.Filled.ArrowForward")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundStyle(Color.white)
                .padding(EdgeInsets(top: 14, leading: 32, bottom: 14, trailing: 32))
                .acmColorBackground(ACMColors.primaryOrange)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            
            Spacer()
        }
    }
        
    private var authPhase: some View {
        VStack(spacing: 0) {
            Spacer()
            
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Join")
                        .font(ACMFont.wide(28))
                        .foregroundStyle(ACMColors.cream)
                    
                    Text("CHOOSE HOW TO CONTINUE")
                        .font(ACMFont.mono(10))
                        .tracking(2)
                        .foregroundStyle(ACMColors.creamDim)
                }
                .padding(EdgeInsets(top: 0, leading: 0, bottom: 16, trailing: 0))
                
                if isGoogleSignInEnabled {
                    Button {
                        handleGoogleSignIn()
                    } label: {
                        HStack(spacing: 12) {
                            if isSigningIn {
                                ProgressView()
#if !SKIP
                                    .progressViewStyle(CircularProgressViewStyle(tint: ACMColors.cream))
#endif
                                    .scaleEffect(0.8)
                            } else {
                                ACMSystemIcon.image("globe", androidName: "Icons.Outlined.AccountCircle")
                                    .font(.system(size: 16))
                            }

                            Text("Continue with Google")
                                .font(ACMFont.trial(14))
                        }
                        .foregroundStyle(ACMColors.cream)
                        .frame(maxWidth: .infinity)
                .padding(EdgeInsets(top: 14, leading: 0, bottom: 14, trailing: 0))
                        .acmColorBackground(ACMColors.surface)
                        .overlay {
                            RoundedRectangle(cornerRadius: 8)
                                .strokeBorder(lineWidth: 1)
                                .foregroundStyle(ACMColors.creamFaint)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .disabled(isSigningIn)

                    HStack(spacing: 16) {
                        Rectangle()
                            .fill(ACMColors.creamFaint)
                            .frame(height: 1)

                        Text("OR")
                            .font(ACMFont.mono(10))
                            .tracking(2)
                            .foregroundStyle(ACMColors.creamMuted)

                        Rectangle()
                            .fill(ACMColors.creamFaint)
                            .frame(height: 1)
                    }
                .padding(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("GUEST NAME")
                        .font(ACMFont.mono(10))
                        .tracking(2)
                        .foregroundStyle(ACMColors.creamDim)
                    
                    TextField("", text: $guestName, prompt: Text("Enter your name").foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.25)))
                        .textFieldStyle(.plain)
                        .font(ACMFont.trial(14))
                        .foregroundStyle(ACMColors.cream)
                .padding(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0))
                .acmColorBackground(ACMColors.surface)
                        .overlay {
                            RoundedRectangle(cornerRadius: 8)
                                .strokeBorder(lineWidth: 1)
                                .foregroundStyle(ACMColors.creamFaint)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onSubmit {
                            if !trimWhitespace(guestName).isEmpty {
                                handleGuest()
                            }
                        }
                    
                    Button {
                        handleGuest()
                    } label: {
                        Text("Continue as Guest")
                            .font(ACMFont.trial(14))
                        .foregroundStyle(Color.white)
                            .frame(maxWidth: .infinity)
                .padding(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0))
                            .acmColorBackground(ACMColors.primaryOrange)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .disabled(trimWhitespace(guestName).isEmpty)
                    .opacity(trimWhitespace(guestName).isEmpty ? 0.3 : 1.0)
                }
                
                Button {
                    phase = .welcome
                } label: {
                    Text("← BACK")
                        .font(ACMFont.mono(11))
                        .tracking(2)
                        .foregroundStyle(ACMColors.creamMuted)
                }
                .padding(EdgeInsets(top: 16, leading: 0, bottom: 0, trailing: 0))
            }
            .frame(maxWidth: 360)
                .padding(EdgeInsets(top: 0, leading: 24, bottom: 0, trailing: 24))
            
            Spacer()
        }
    }
    
    // MARK: - Join Phase (Camera preview + Form)
    
    private func joinPhase(geometry: GeometryProxy) -> some View {
        let isWide = geometry.size.width > 700
        
        return Group {
            if isWide {
                HStack(alignment: .top, spacing: 40) {
                    cameraPreviewSection
                        .frame(maxWidth: 600)
                    
                    joinFormSection
                        .frame(maxWidth: 400)
                }
                .padding(EdgeInsets(top: 0, leading: 40, bottom: 0, trailing: 40))
                .padding(EdgeInsets(top: 24, leading: 0, bottom: 24, trailing: 0))
            } else {
                ScrollView {
                    VStack(spacing: 24) {
                        cameraPreviewSection
                            .frame(height: geometry.size.height * 0.4)
                        
                        joinFormSection
                    }
                .padding(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                .padding(EdgeInsets(top: 24, leading: 0, bottom: 24, trailing: 0))
                }
            }
        }
    }
    
    // MARK: - Camera Preview Section
    
    private var cameraPreviewSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Video preview container
            ZStack {
                // Background
                RoundedRectangle(cornerRadius: 16)
                    .fill(ACMColors.surface)
                
                // Camera feed or avatar
                if isCameraOn {
#if SKIP
                    Color.black
                        .clipShape(RoundedRectangle(cornerRadius: 16))
#else
                    if let session = captureSession {
                        CameraPreviewRepresentable(session: session)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .scaleEffect(x: -1, y: 1) // Mirror
                    } else {
                        Color.black
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
#endif
                } else {
                    // Avatar when camera off
                    VStack {
                        Circle()
                            .fill(ACMGradients.avatarBackground)
                            .frame(width: 80, height: 80)
                            .overlay {
                                Circle()
                                    .strokeBorder(lineWidth: 1)
                                    .foregroundStyle(ACMColors.creamSubtle)
                            }
                            .overlay {
                                Text(userInitial)
                                    .font(.system(size: 32, weight: .bold))
                                    .foregroundStyle(ACMColors.cream)
                            }
                    }
                }
                
                // User email badge (top left)
                VStack {
                    HStack {
                        Text(userEmail)
                            .font(ACMFont.mono(11))
                            .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.7))
                .padding(EdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 10))
                .padding(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                    .acmColorBackground(Color(red: 0, green: 0, blue: 0, opacity: 0.5))
                    .acmMaterialBackground(opacity: 0.3)
                            .clipShape(Capsule())
                        
                        Spacer()
                    }
                .padding(12)
                    
                    Spacer()
                    
                    // Media controls (bottom center)
                    HStack(spacing: 8) {
                        // Mic toggle
                        Button {
                            toggleMic()
                        } label: {
                            ACMSystemIcon.image(
                                isMicOn ? "mic.fill" : "mic.slash.fill",
                                androidName: isMicOn ? "Icons.Filled.Call" : "Icons.Filled.Close"
                            )
                                .font(.system(size: 16))
                                .foregroundStyle(Color.white)
                                .frame(width: 36, height: 36)
                                .acmColorBackground(isMicOn ? acmColor01(red: 1.0, green: 1.0, blue: 1.0, opacity: 0.1) : acmColor01(red: 1.0, green: 0.0, blue: 0.0))
                                .clipShape(Circle())
                        }
                        
                        // Camera toggle
                        Button {
                            toggleCamera()
                        } label: {
                            ACMSystemIcon.image(
                                isCameraOn ? "video.fill" : "video.slash.fill",
                                androidName: isCameraOn ? "Icons.Filled.PlayArrow" : "Icons.Filled.Close"
                            )
                                .font(.system(size: 16))
                                .foregroundStyle(Color.white)
                                .frame(width: 36, height: 36)
                                .acmColorBackground(isCameraOn ? acmColor01(red: 1.0, green: 1.0, blue: 1.0, opacity: 0.1) : acmColor01(red: 1.0, green: 0.0, blue: 0.0))
                                .clipShape(Circle())
                        }
                    }
                .padding(8)
                    .acmColorBackground(Color(red: 0, green: 0, blue: 0, opacity: 0.5))
                    .acmMaterialBackground(opacity: 0.3)
                    .clipShape(Capsule())
                .padding(EdgeInsets(top: 0, leading: 0, bottom: 12, trailing: 0))
                }
            }
            .aspectRatio(16.0 / 10.0, contentMode: .fit)
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(lineWidth: 1)
                    .foregroundStyle(ACMColors.creamFaint)
            }
            
            // Preflight status indicators
            HStack(spacing: 8) {
                Text("PREFLIGHT")
                    .font(ACMFont.mono(10))
                    .tracking(2)
                    .foregroundStyle(ACMColors.creamDim)
                
                // Mic status
                HStack(spacing: 6) {
                    Circle()
                        .fill(isMicOn ? Color.green : ACMColors.primaryOrange)
                        .frame(width: 6, height: 6)
                    
                    Text("Mic \(isMicOn ? "On" : "Off")")
                        .font(ACMFont.mono(10))
                        .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.7))
                }
                .padding(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
                .padding(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                .acmColorBackground(Color(red: 0, green: 0, blue: 0, opacity: 0.4))
                .overlay {
                    Capsule()
                        .strokeBorder(lineWidth: 1)
                        .foregroundStyle(ACMColors.creamFaint)
                }
                .clipShape(Capsule())
                
                // Camera status
                HStack(spacing: 6) {
                    Circle()
                        .fill(isCameraOn ? Color.green : ACMColors.primaryOrange)
                        .frame(width: 6, height: 6)
                    
                    Text("Camera \(isCameraOn ? "On" : "Off")")
                        .font(ACMFont.mono(10))
                        .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.7))
                }
                .padding(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
                .padding(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                .acmColorBackground(Color(red: 0, green: 0, blue: 0, opacity: 0.4))
                .overlay {
                    Capsule()
                        .strokeBorder(lineWidth: 1)
                        .foregroundStyle(ACMColors.creamFaint)
                }
                .clipShape(Capsule())
            }
        }
    }
    
    // MARK: - Join Form Section
    
    private var joinFormSection: some View {
        VStack(spacing: 0) {
            // Tab switcher (New Meeting / Join)
            HStack(spacing: 0) {
                Button {
                    activeTab = .new
                } label: {
                    Text("NEW MEETING")
                        .font(ACMFont.mono(11))
                        .tracking(1)
                        .foregroundStyle(activeTab == .new ? Color.white : acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.5))
                        .frame(maxWidth: .infinity)
                .padding(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0))
                        .acmColorBackground(activeTab == .new ? ACMColors.primaryOrange : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                
                Button {
                    activeTab = .join
                } label: {
                    Text("JOIN")
                        .font(ACMFont.mono(11))
                        .tracking(1)
                        .foregroundStyle(activeTab == .join ? Color.white : acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.5))
                        .frame(maxWidth: .infinity)
                .padding(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0))
                        .acmColorBackground(activeTab == .join ? ACMColors.primaryOrange : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
                .padding(4)
            .acmColorBackground(ACMColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(EdgeInsets(top: 0, leading: 0, bottom: 24, trailing: 0))
            
            // Form content based on tab
            if activeTab == .new {
                // New Meeting form
                VStack(spacing: 16) {
                    // Display name input
                    VStack(alignment: .leading, spacing: 8) {
                        Text("DISPLAY NAME")
                            .font(ACMFont.mono(10))
                            .tracking(2)
                            .foregroundStyle(ACMColors.creamDim)
                        
                        TextField("", text: $displayNameInput, prompt: Text("Your name").foregroundStyle(ACMColors.creamMuted))
                            .textFieldStyle(.plain)
                            .font(ACMFont.trial(14))
                            .foregroundStyle(ACMColors.cream)
                .padding(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
                .padding(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0))
                            .acmColorBackground(ACMColors.surface)
                            .overlay {
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(lineWidth: 1)
                                    .foregroundStyle(ACMColors.creamFaint)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    
                    // Start Meeting button
                    Button {
                        handleCreateRoom()
                    } label: {
                        HStack(spacing: 8) {
            if viewModel.state.connectionState == ConnectionState.connecting {
                                ProgressView()
#if !SKIP
                                    .progressViewStyle(CircularProgressViewStyle(tint: Color.white))
#endif
                                    .scaleEffect(0.8)
                            } else {
                                ACMSystemIcon.image("plus", androidName: "Icons.Filled.Add")
                                    .font(.system(size: 14, weight: .medium))
                            }
                            
                            Text("Start Meeting")
                                .font(ACMFont.trial(14))
                        }
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                .padding(EdgeInsets(top: 14, leading: 0, bottom: 14, trailing: 0))
                        .acmColorBackground(ACMColors.primaryOrange)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                .disabled(viewModel.state.connectionState == ConnectionState.connecting)
                }
            } else {
                // Join Meeting form
                VStack(spacing: 16) {
                    // Room name input
                    VStack(alignment: .leading, spacing: 8) {
                        Text("ROOM NAME")
                            .font(ACMFont.mono(10))
                            .tracking(2)
                            .foregroundStyle(ACMColors.creamDim)
                        
                        TextField("", text: sanitizedRoomCodeBinding, prompt: Text("Paste room link or code").foregroundStyle(ACMColors.creamMuted))
                            .textFieldStyle(.plain)
                            .font(ACMFont.trial(14))
                            .foregroundStyle(Color.white)
#if !SKIP
                            .autocapitalization(.none)
                            .autocorrectionDisabled(true)
#endif
                            .padding(.leading, 12)
                            .padding(.trailing, 12)
                            .padding(.top, 12)
                            .padding(.bottom, 12)
                            .acmColorBackground(ACMColors.surface)
                            .overlay {
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(lineWidth: 1)
                                    .foregroundStyle(ACMColors.creamFaint)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .onSubmit {
                                if !roomCode.isEmpty {
                                    handleJoinRoom()
                                }
                            }
                    }
                    
                    // Display name input
                    VStack(alignment: .leading, spacing: 8) {
                        Text("DISPLAY NAME")
                            .font(ACMFont.mono(10))
                            .tracking(2)
                            .foregroundStyle(ACMColors.creamDim)
                        
                        TextField("", text: $displayNameInput, prompt: Text("Your name").foregroundStyle(ACMColors.creamMuted))
                            .textFieldStyle(.plain)
                            .font(ACMFont.trial(14))
                            .foregroundStyle(ACMColors.cream)
                .padding(EdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12))
                .padding(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0))
                            .acmColorBackground(ACMColors.surface)
                            .overlay {
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(lineWidth: 1)
                                    .foregroundStyle(ACMColors.creamFaint)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    
                    // Join button
                    Button {
                        handleJoinRoom()
                    } label: {
                        HStack(spacing: 8) {
                            if viewModel.state.connectionState == ConnectionState.connecting {
                                ProgressView()
#if !SKIP
                                    .progressViewStyle(CircularProgressViewStyle(tint: Color.white))
#endif
                                    .scaleEffect(0.8)
                            } else {
                                ACMSystemIcon.image("arrow.forward", androidName: "Icons.Filled.ArrowForward")
                                    .font(.system(size: 14, weight: .medium))
                            }
                            
                            Text("Join Meeting")
                                .font(ACMFont.trial(14))
                        }
                            .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                .padding(EdgeInsets(top: 14, leading: 0, bottom: 14, trailing: 0))
                        .acmColorBackground(ACMColors.primaryOrange)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .disabled(roomCode.isEmpty || viewModel.state.connectionState == ConnectionState.connecting)
                    .opacity(roomCode.isEmpty ? 0.3 : 1.0)
                }
            }
        }
                .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(acmColor(red: 26.0, green: 26.0, blue: 26.0, opacity: 0.92))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(lineWidth: 1)
                .foregroundStyle(ACMColors.creamFaint)
        }
    }
    
    // MARK: - Loading Overlay
    
    private var loadingOverlay: some View {
        ZStack {
            acmColor01(red: 0.0, green: 0.0, blue: 0.0, opacity: 0.8)
                .ignoresSafeArea()
            
            VStack(spacing: 12) {
                ProgressView()
#if !SKIP
                    .progressViewStyle(CircularProgressViewStyle(tint: ACMColors.primaryOrange))
#endif
                    .scaleEffect(1.5)
                
                Text(viewModel.state.connectionState == ConnectionState.reconnecting ? "RECONNECTING..." : "JOINING...")
                    .font(ACMFont.mono(12))
                    .tracking(2)
                    .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.6))
            }
        }
    }
    
    // MARK: - Background Pattern
    
    private var dotGridPattern: some View {
        GeometryReader { geometry in
#if !SKIP
            Canvas { context, size in
                let spacing: CGFloat = 30
                let dotSize: CGFloat = 1.5
                
                for x in stride(from: 0, to: size.width, by: spacing) {
                    for y in stride(from: 0, to: size.height, by: spacing) {
                        let rect = CGRect(
                            x: x - dotSize/2,
                            y: y - dotSize/2,
                            width: dotSize,
                            height: dotSize
                        )
                        context.fill(
                            Path(ellipseIn: rect),
                            with: GraphicsContext.Shading.color(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.035))
                        )
                    }
                }
            }
#else
            Color.clear
#endif
        }
    }
    
    // MARK: - Computed Properties
    
    private var userEmail: String {
        appState.currentUser?.email ?? guestName
    }
    
    private var userInitial: String {
        String((appState.currentUser?.name ?? guestName).prefix(1)).uppercased()
    }
    
    // MARK: - Actions
    
    private func handleGoogleSignIn() {
        isSigningIn = true
        // In production, implement proper OAuth flow
        // For now, simulate sign-in
#if SKIP
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            isSigningIn = false
        }
#else
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isSigningIn = false
            // TODO: Implement actual Google Sign-In
        }
#endif
    }
    
    private func handleGuest() {
        let trimmedName = trimWhitespace(guestName)
        guard !trimmedName.isEmpty else { return }
        
        appState.currentUser = AppState.User(
            id: "guest-\(Int(Date().timeIntervalSince1970 * 1000))",
            name: trimmedName,
            email: "\(trimmedName)@guest.local"
        )
        displayNameInput = trimmedName
        phase = .join
    }
    
    private func handleCreateRoom() {
        viewModel.state.isAdmin = true
        let roomId = generateRoomCode()
        viewModel.state.displayName = displayNameInput.isEmpty ? (appState.currentUser?.name ?? "Host") : displayNameInput
        viewModel.state.isMuted = !isMicOn
        viewModel.state.isCameraOff = !isCameraOn
        let userPayload = SfuJoinUser(
            id: appState.currentUser?.id,
            email: appState.currentUser?.email,
            name: appState.currentUser?.name
        )
        viewModel.joinRoom(
            roomId: roomId,
            displayName: viewModel.state.displayName,
            isGhost: isGhostMode,
            user: userPayload,
            isHost: true
        )
    }
    
    private func handleJoinRoom() {
        let extractedCode = extractRoomCode(from: roomCode)
        guard !extractedCode.isEmpty else { return }
        if extractedCode != roomCode {
            roomCode = extractedCode
        }
        viewModel.state.isAdmin = false
        viewModel.state.displayName = displayNameInput.isEmpty ? (appState.currentUser?.name ?? "Guest") : displayNameInput
        viewModel.state.isMuted = !isMicOn
        viewModel.state.isCameraOff = !isCameraOn
        let userPayload = SfuJoinUser(
            id: appState.currentUser?.id,
            email: appState.currentUser?.email,
            name: appState.currentUser?.name
        )
        viewModel.joinRoom(
            roomId: extractedCode,
            displayName: viewModel.state.displayName,
            isGhost: isGhostMode,
            user: userPayload,
            isHost: false
        )
    }
    
    private func generateRoomCode() -> String {
        var words: [String] = []
        for _ in 0..<roomWordsPerCode {
            if let word = roomWords.randomElement() {
                words.append(word)
            }
        }
        return words.joined(separator: roomWordSeparator)
    }

    private func sanitizeRoomCode(_ value: String) -> String {
        let normalized = normalizeRoomCharacters(in: value)
        guard !normalized.isEmpty else { return "" }

        let separator: Character = "-"
        let words = normalized
            .split(separator: separator, omittingEmptySubsequences: true)
            .prefix(roomWordsPerCode)
            .map { String($0.prefix(roomWordMaxLength)) }

        return words.joined(separator: roomWordSeparator)
    }

    private func sanitizeRoomCodeInput(_ value: String) -> String {
        normalizeRoomCharacters(in: value)
    }

    private func normalizeRoomCharacters(in input: String) -> String {
        let separator: Character = "-"
        var normalized = ""
        var previousWasSeparator = false

        let letters = "abcdefghijklmnopqrstuvwxyz"
        for character in input.lowercased() {
            if letters.contains(character) {
                normalized += String(character)
                previousWasSeparator = false
            } else if !normalized.isEmpty && !previousWasSeparator {
                normalized += String(separator)
                previousWasSeparator = true
            }
        }

        if previousWasSeparator && !normalized.isEmpty {
            normalized = String(normalized.dropLast())
        }

        return normalized
    }

    private func extractRoomCode(from input: String) -> String {
        let trimmed = trimWhitespaceAndNewlines(input)
        guard !trimmed.isEmpty else { return "" }

        if let url = URL(string: trimmed), let last = url.pathComponents.last {
            return sanitizeRoomCode(last)
        }

        if trimmed.contains("/") {
            if let last = trimmed.split(separator: "/").last {
                return sanitizeRoomCode(String(last))
            }
        }

        return sanitizeRoomCode(trimmed)
    }

    private func trimCharacters(in value: String, condition: (Character) -> Bool) -> String {
        var start = value.startIndex
        var end = value.endIndex

        while start < end, condition(value[start]) {
            start = value.index(after: start)
        }

        while start < end, condition(value[value.index(before: end)]) {
            end = value.index(before: end)
        }

        return String(value[start..<end])
    }

    private func trimWhitespace(_ value: String) -> String {
        trimCharacters(in: value) { $0.isWhitespace }
    }

    private func trimWhitespaceAndNewlines(_ value: String) -> String {
        trimCharacters(in: value) { $0.isWhitespace || $0.isNewline }
    }

    private let roomWords = [
        "aloe", "aster", "bloom", "canna", "cedar", "clove", "dahl", "daisy", "erica", "flora",
        "hazel", "iris", "lilac", "lily", "lotus", "maple", "myrrh", "olive", "pansy", "peony",
        "poppy", "rose", "sorel", "tansy", "thyme", "tulip", "yucca", "zinn", "akane", "akira",
        "asuna", "eren", "gohan", "goku", "gojo", "kanao", "kira", "levi", "luffy", "maki",
        "misa", "nami", "riku", "sokka", "saber", "senku", "shoto", "soma", "sora", "tanji",
        "taki", "toji", "todo", "toph", "yami", "yuki", "yato", "zoro"
    ]

    private let roomWordsPerCode = 3
    private let roomWordSeparator = "-"
    private var roomWordMaxLength: Int {
        roomWords.map(\.count).max() ?? 0
    }

    private var sanitizedRoomCodeBinding: Binding<String> {
        Binding(
            get: { roomCode },
            set: { newValue in
                if newValue.contains("/") || newValue.contains(":") {
                    roomCode = newValue
                } else {
                    roomCode = sanitizeRoomCodeInput(newValue)
                }
            }
        )
    }
    
    private func toggleCamera() {
#if SKIP
        isCameraOn = !isCameraOn
#else
        if isCameraOn {
            captureSession?.stopRunning()
            captureSession = nil
            isCameraOn = false
        } else {
            setupCamera()
        }
#endif
    }
    
    private func toggleMic() {
        isMicOn = !isMicOn
        // Audio session will be configured when joining
    }
    
    #if SKIP
    #else
    private func setupCamera() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            guard granted else { return }
            
            DispatchQueue.main.async {
                let session = AVCaptureSession()
                session.sessionPreset = .medium
                
                guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
                      let input = try? AVCaptureDeviceInput(device: device),
                      session.canAddInput(input) else {
                    return
                }
                
                session.addInput(input)
                
                DispatchQueue.global(qos: .userInitiated).async {
                    session.startRunning()
                }
                
                self.captureSession = session
                self.isCameraOn = true
            }
        }
    }
    #endif
}

#if SKIP
#else
// MARK: - Camera Preview UIViewRepresentable

struct CameraPreviewRepresentable: UIViewRepresentable {
    let session: AVCaptureSession
    
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .black
        
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        
        context.coordinator.previewLayer = previewLayer
        
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            context.coordinator.previewLayer?.frame = uiView.bounds
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }
    
    class Coordinator {
        var previewLayer: AVCaptureVideoPreviewLayer?
    }
}
#endif

#Preview {
    JoinView(viewModel: MeetingViewModel(), appState: AppState())
}
