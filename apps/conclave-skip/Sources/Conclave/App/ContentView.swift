import SwiftUI
import Observation

//
//  ContentView.swift
//  Conclave
//
//  Root navigation view with state-based routing
//

struct ContentView: View {
    @Bindable var appState: AppState
    @State var meetingViewModel = MeetingViewModel()

    var body: some View {
        Group {
            switch meetingViewModel.state.connectionState {
            case .disconnected, .connecting, .connected:
                JoinView(viewModel: meetingViewModel, appState: appState)
                    .transition(.opacity)

            case .joining, .joined, .reconnecting:
                MeetingView(viewModel: meetingViewModel)
                    .transition(.opacity)

            case .waiting:
                WaitingRoomView(viewModel: meetingViewModel)
                    .transition(.opacity)

            case .error:
                ErrorView(
                    message: meetingViewModel.state.errorMessage ?? "An error occurred",
                    onRetry: { meetingViewModel.resetError() }
                )
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: meetingViewModel.state.connectionState)
        .preferredColorScheme(.dark)
    }
}

// MARK: - Waiting Room View

struct WaitingRoomView: View {
    @Bindable var viewModel: MeetingViewModel

    var body: some View {
        ZStack {
            ACMColors.dark
                .ignoresSafeArea()

            GeometryReader { geometry in
#if !SKIP
                Canvas { context, size in
                    let spacing: CGFloat = 30
                    let dotSize: CGFloat = 1.5

                    for x in stride(from: 0, to: size.width, by: spacing) {
                        for y in stride(from: 0, to: size.height, by: spacing) {
                            let rect = CGRect(
                                x: x - dotSize / 2,
                                y: y - dotSize / 2,
                                width: dotSize,
                                height: dotSize
                            )
                            context.fill(
                                Path(ellipseIn: rect),
                                with: GraphicsContext.Shading.color(ACMColors.creamGhost)
                            )
                        }
                    }
                }
#else
                Color.clear
#endif
            }
            .ignoresSafeArea()

            VStack(spacing: 32) {
                ZStack {
                    Circle()
                        .stroke(ACMColors.primaryOrangeGhost, lineWidth: 4)
                        .frame(width: 80.0, height: 80.0)

#if SKIP
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(ACMColors.primaryOrange)
#else
                    Circle()
                        .trim(from: 0.0, to: 0.7)
                        .stroke(ACMColors.primaryOrange, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .frame(width: 80.0, height: 80.0)
                        .rotationEffect(Angle.degrees(-90))
                        .modifier(RotatingModifier())
#endif
                }

                VStack(spacing: 12) {
                    Text("Waiting for host")
                        .font(ACMFont.wide(24))
                        .foregroundStyle(ACMColors.cream)

                    Text(viewModel.state.waitingMessage ?? "You'll join as soon as the host lets you in")
                        .font(ACMFont.trial(14))
                        .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.5))
                        .multilineTextAlignment(.center)
                }

                HStack(spacing: 8) {
                    ACMSystemIcon.image("number", androidName: "Icons.Outlined.Info")
                        .font(.system(size: 12))
                        .foregroundStyle(ACMColors.creamDim)

                    Text(viewModel.state.roomId.uppercased())
                        .font(ACMFont.mono(14))
                        .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.7))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .acmColorBackground(ACMColors.surface)
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(lineWidth: 1)
                        .foregroundStyle(ACMColors.creamFaint)
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))

                Button {
                    viewModel.leaveRoom()
                } label: {
                    Text("Cancel")
                        .font(ACMFont.trial(14))
                        .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.6))
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .overlay {
                            RoundedRectangle(cornerRadius: 8)
                                .strokeBorder(lineWidth: 1)
                                .foregroundStyle(ACMColors.creamSubtle)
                        }
                }
                .padding(.top, 16)
            }
            .padding(32)
        }
    }
}

struct RotatingModifier: ViewModifier {
    @State var isRotating = false

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees(isRotating ? 360.0 : 0.0))
            .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: isRotating)
            .onAppear {
                isRotating = true
            }
    }
}

// MARK: - Error View

struct ErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ZStack {
            ACMColors.dark
                .ignoresSafeArea()

            VStack(spacing: 24) {
                ZStack {
                    Circle()
                        .fill(acmColor01(red: 1.0, green: 0.0, blue: 0.0, opacity: 0.1))
                        .frame(width: 80, height: 80)

                    ACMSystemIcon.image("exclamationmark.triangle.fill", androidName: "Icons.Filled.Warning")
                        .font(.system(size: 36))
                        .foregroundStyle(Color.red)
                }

                VStack(spacing: 8) {
                    Text("Something went wrong")
                        .font(ACMFont.wide(20))
                        .foregroundStyle(ACMColors.cream)

                    Text(message)
                        .font(ACMFont.trial(14))
                        .foregroundStyle(acmColor(red: 254.0, green: 252.0, blue: 217.0, opacity: 0.5))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                }

                Button(action: onRetry) {
                    HStack(spacing: 8) {
                        ACMSystemIcon.image("arrow.clockwise.circle", androidName: "Icons.Filled.Refresh")
                            .font(.system(size: 14, weight: .medium))

                        Text("Try Again")
                            .font(ACMFont.trial(14, weight: .medium))
                    }
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .acmColorBackground(ACMColors.primaryOrange)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(32)
        }
    }
}

#Preview {
    ContentView(appState: AppState())
}
