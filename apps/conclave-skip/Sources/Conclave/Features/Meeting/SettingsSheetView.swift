import SwiftUI
import Observation
#if canImport(UIKit) && !SKIP
import UIKit
#endif

// MARK: - Settings Sheet

enum SettingsSheetPage {
    case overview
    case room
    case webinar
    case profile
    case audioVideo
    case videoQuality
}

struct SettingsSheetView: View {
    @Bindable var viewModel: MeetingViewModel
    var bodyReady: Bool = true
    var page: SettingsSheetPage = .overview
    @Environment(\.dismiss) private var dismiss
    var onBack: (() -> Void)? = nil
    var onOpenRoomSettings: (() -> Void)? = nil
    var onOpenWebinarSettings: (() -> Void)? = nil
    var onOpenProfileSettings: (() -> Void)? = nil
    var onOpenAudioVideoSettings: (() -> Void)? = nil
    var onOpenVideoQualitySettings: (() -> Void)? = nil
    @State private var displayNameInput = ""
    @State private var meetingInviteCodeInput = ""
    @State private var webinarInviteCodeInput = ""
    @State private var webinarMaxAttendeesInput = ""
    @State private var webinarLinkCodeInput = ""
    @State private var didCopyWebinarLink = false
    @State private var webinarLinkCopyFeedbackGeneration = 0
    @State private var isConfirmingWebinarLinkRotation = false

    private var isDisplayNameEmpty: Bool {
        displayNameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var isMeetingInviteCodeEmpty: Bool {
        meetingInviteCodeInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var title: String {
        switch page {
        case .overview:
            return "Settings"
        case .room:
            return "Room"
        case .webinar:
            return "Webinar"
        case .profile:
            return "Profile"
        case .audioVideo:
            return "Audio and video"
        case .videoQuality:
            return "Video"
        }
    }

    private var webinarMaxAttendeesValue: Int? {
        let trimmed = webinarMaxAttendeesInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Int(trimmed), (1...5000).contains(value) else { return nil }
        return value
    }

    private var sanitizedWebinarLinkInput: String {
        sanitizeWebinarLinkCode(webinarLinkCodeInput)
    }

    private var isWebinarLinkInputValid: Bool {
        let candidate = sanitizedWebinarLinkInput
        return candidate.isEmpty || (3...32).contains(candidate.count)
    }

    private func syncWebinarCapacityDraftFromState() {
        webinarMaxAttendeesInput = "\(viewModel.state.webinarMaxAttendees)"
    }

    private func syncWebinarLinkDraftFromState() {
        webinarLinkCodeInput = viewModel.state.webinarLinkSlug ?? ""
    }

    private func syncWebinarDraftsFromState() {
        syncWebinarCapacityDraftFromState()
        syncWebinarLinkDraftFromState()
    }

    @ViewBuilder
    private func rowLabel(_ title: String) -> some View {
        Text(title)
            .font(ACMFont.trial(15))
            .foregroundStyle(ACMColors.text)
            .lineLimit(1)
    }

    @ViewBuilder
    private func settingsToggleRow(_ title: String, icon: String, androidIcon: String, isOn: Binding<Bool>, isActive: Bool = false, isDisabled: Bool = false) -> some View {
        let iconTint = isDisabled ? ACMColors.textFaint : (isActive ? ACMColors.primaryOrange : ACMColors.textMuted)
        let androidTint = isDisabled ? "faint" : (isActive ? "accent" : "muted")

        Toggle(isOn: isOn) {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: icon,
                    androidIcon: androidIcon,
                    tint: iconTint,
                    androidTint: androidTint
                )

                Text(title)
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(isDisabled ? ACMColors.textFaint : ACMColors.text)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, ACMSpacing.sm)
        .frame(height: 52)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.62 : 1.0)
    }

    @ViewBuilder
    private func settingsNavigationRow(
        _ title: String,
        subtitle: String,
        icon: String,
        androidIcon: String,
        isActive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: icon,
                    androidIcon: androidIcon,
                    tint: isActive ? ACMColors.primaryOrange : ACMColors.textMuted,
                    androidTint: isActive ? "accent" : "muted"
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(ACMFont.trial(15, weight: .medium))
                        .foregroundStyle(ACMColors.text)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(ACMFont.trial(12))
                        .foregroundStyle(ACMColors.textFaint)
                        .lineLimit(1)
                }

                Spacer()

                ACMSystemIcon.icon("chevron.right", android: "arrow.forward", size: 16, tint: "faint")
                    .foregroundStyle(ACMColors.textFaint)
                    .frame(width: 24, height: 24)
            }
            .padding(.horizontal, ACMSpacing.sm)
            .frame(height: 58)
            .frame(maxWidth: .infinity, alignment: .leading)
            #if !SKIP
            .contentShape(Rectangle())
            #endif
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func meetingInviteCodeRow() -> some View {
        VStack(alignment: .leading, spacing: ACMSpacing.sm) {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: "key.fill",
                    androidIcon: "key",
                    tint: viewModel.state.meetingRequiresInviteCode ? ACMColors.primaryOrange : ACMColors.textMuted,
                    androidTint: viewModel.state.meetingRequiresInviteCode ? "accent" : "muted"
                )

                Text("Meeting invite code")
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(ACMColors.text)
                    .lineLimit(1)

                Spacer()

                Text(viewModel.state.meetingRequiresInviteCode ? "Protected" : "Open")
                    .font(ACMFont.trial(12, weight: .medium))
                    .foregroundStyle(viewModel.state.meetingRequiresInviteCode ? ACMColors.primaryOrange : ACMColors.textFaint)
                    .lineLimit(1)
            }

            TextField("", text: $meetingInviteCodeInput, prompt: Text("Invite code").foregroundStyle(ACMColors.textFaint))
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
                .padding(.horizontal, ACMSpacing.sm)
                .frame(height: 44)
                .acmColorBackground(ACMColors.surfaceRaised)
                .overlay {
                    RoundedRectangle(cornerRadius: ACMRadius.sm)
                        .strokeBorder(lineWidth: 1)
                        .foregroundStyle(ACMColors.border)
                }
                .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))

            HStack(spacing: ACMSpacing.sm) {
                Button {
                    viewModel.setMeetingInviteCode(meetingInviteCodeInput)
                } label: {
                    HStack(spacing: 6) {
                        ACMSystemIcon.icon("checkmark", android: "check", size: 13, tint: isMeetingInviteCodeEmpty ? "faint" : "white")
                        Text("Set")
                            .font(ACMFont.trial(14, weight: .medium))
                    }
                    .foregroundStyle(isMeetingInviteCodeEmpty ? ACMColors.textFaint : Color.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .acmColorBackground(isMeetingInviteCodeEmpty ? ACMColors.surfaceRaised : ACMColors.primaryOrange)
                    .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(isMeetingInviteCodeEmpty)

                Button {
                    viewModel.clearMeetingInviteCode()
                    meetingInviteCodeInput = ""
                } label: {
                    HStack(spacing: 6) {
                        ACMSystemIcon.icon("trash", android: "delete", size: 13, tint: viewModel.state.meetingRequiresInviteCode ? "danger" : "faint")
                        Text("Remove")
                            .font(ACMFont.trial(14, weight: .medium))
                    }
                    .foregroundStyle(viewModel.state.meetingRequiresInviteCode ? ACMColors.error : ACMColors.textFaint)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .acmColorBackground(ACMColors.surfaceRaised)
                    .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(!viewModel.state.meetingRequiresInviteCode)
            }
        }
        .padding(ACMSpacing.sm)
    }

    @ViewBuilder
    private func webinarSection() -> some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Webinar")

            MeetingSheetSectionCard {
                settingsToggleRow(
                    viewModel.state.isWebinarEnabled ? "Webinar mode" : "Start webinar mode",
                    icon: "person.2.fill",
                    androidIcon: "participants",
                    isOn: Binding(
                        get: { viewModel.state.isWebinarEnabled },
                        set: { next in
                            if next != viewModel.state.isWebinarEnabled {
                                viewModel.toggleWebinarEnabled()
                            }
                        }
                    ),
                    isActive: viewModel.state.isWebinarEnabled
                )

                if viewModel.state.isWebinarEnabled {
                    MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                    settingsToggleRow(
                        "Public access",
                        icon: "globe",
                        androidIcon: "public",
                        isOn: Binding(
                            get: { viewModel.state.isWebinarPublicAccess },
                            set: { next in
                                if next != viewModel.state.isWebinarPublicAccess {
                                    viewModel.toggleWebinarPublicAccess()
                                }
                            }
                        ),
                        isActive: viewModel.state.isWebinarPublicAccess
                    )
                    MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                    settingsToggleRow(
                        "Lock attendees",
                        icon: viewModel.state.isWebinarLocked ? "lock.fill" : "lock.open.fill",
                        androidIcon: viewModel.state.isWebinarLocked ? "lock" : "lock.open",
                        isOn: Binding(
                            get: { viewModel.state.isWebinarLocked },
                            set: { next in
                                if next != viewModel.state.isWebinarLocked {
                                    viewModel.toggleWebinarLocked()
                                }
                            }
                        ),
                        isActive: viewModel.state.isWebinarLocked
                    )
                    MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                    webinarCapacityRow()
                    MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                    webinarInviteCodeRow()
                    MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                    webinarLinkRow()
                }
            }
            .onAppear {
                if webinarMaxAttendeesInput.isEmpty {
                    webinarMaxAttendeesInput = "\(viewModel.state.webinarMaxAttendees)"
                }
                if webinarLinkCodeInput.isEmpty {
                    webinarLinkCodeInput = viewModel.state.webinarLinkSlug ?? ""
                }
            }
        }
    }

    @ViewBuilder
    private func webinarCapacityRow() -> some View {
        VStack(alignment: .leading, spacing: ACMSpacing.sm) {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: "person.2.fill",
                    androidIcon: "participants",
                    tint: ACMColors.textMuted,
                    androidTint: "muted"
                )

                Text("Max attendees")
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(ACMColors.text)
                    .lineLimit(1)

                Spacer()

                Text("\(viewModel.state.webinarAttendeeCount) / \(viewModel.state.webinarMaxAttendees)")
                    .font(ACMFont.trial(12, weight: .medium))
                    .foregroundStyle(ACMColors.textFaint)
                    .lineLimit(1)
            }

            HStack(spacing: ACMSpacing.sm) {
                TextField("", text: $webinarMaxAttendeesInput, prompt: Text("500").foregroundStyle(ACMColors.textFaint))
                    .textFieldStyle(.plain)
                    .font(ACMFont.trial(15))
                    .foregroundStyle(ACMColors.text)
                    .tint(ACMColors.primaryOrange)
#if !SKIP
#if os(iOS)
                    .keyboardType(.numberPad)
#endif
#endif
                    .padding(.horizontal, ACMSpacing.sm)
                    .frame(height: 40)
                    .acmColorBackground(ACMColors.surfaceRaised)
                    .overlay {
                        RoundedRectangle(cornerRadius: ACMRadius.sm)
                            .strokeBorder(lineWidth: 1)
                            .foregroundStyle(ACMColors.border)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))

                Button {
                    if let value = webinarMaxAttendeesValue {
                        viewModel.setWebinarMaxAttendees(value)
                        webinarMaxAttendeesInput = "\(value)"
                    }
                } label: {
                    Text("Save")
                        .font(ACMFont.trial(14, weight: .medium))
                        .foregroundStyle(webinarMaxAttendeesValue == nil ? ACMColors.textFaint : Color.white)
                        .frame(width: 72, height: 40)
                        .acmColorBackground(webinarMaxAttendeesValue == nil ? ACMColors.surfaceRaised : ACMColors.primaryOrange)
                        .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(webinarMaxAttendeesValue == nil)
            }
        }
        .padding(ACMSpacing.sm)
    }

    @ViewBuilder
    private func webinarInviteCodeRow() -> some View {
        VStack(alignment: .leading, spacing: ACMSpacing.sm) {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: "key.fill",
                    androidIcon: "key",
                    tint: viewModel.state.webinarRequiresInviteCode ? ACMColors.primaryOrange : ACMColors.textMuted,
                    androidTint: viewModel.state.webinarRequiresInviteCode ? "accent" : "muted"
                )

                Text("Attendee invite code")
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(ACMColors.text)
                    .lineLimit(1)

                Spacer()

                Text(viewModel.state.webinarRequiresInviteCode ? "Protected" : "Open")
                    .font(ACMFont.trial(12, weight: .medium))
                    .foregroundStyle(viewModel.state.webinarRequiresInviteCode ? ACMColors.primaryOrange : ACMColors.textFaint)
                    .lineLimit(1)
            }

            TextField("", text: $webinarInviteCodeInput, prompt: Text("Invite code").foregroundStyle(ACMColors.textFaint))
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
                .padding(.horizontal, ACMSpacing.sm)
                .frame(height: 40)
                .acmColorBackground(ACMColors.surfaceRaised)
                .overlay {
                    RoundedRectangle(cornerRadius: ACMRadius.sm)
                        .strokeBorder(lineWidth: 1)
                        .foregroundStyle(ACMColors.border)
                }
                .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))

            HStack(spacing: ACMSpacing.sm) {
                let isEmpty = webinarInviteCodeInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                Button {
                    viewModel.setWebinarInviteCode(webinarInviteCodeInput)
                } label: {
                    Text("Set")
                        .font(ACMFont.trial(14, weight: .medium))
                        .foregroundStyle(isEmpty ? ACMColors.textFaint : Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .acmColorBackground(isEmpty ? ACMColors.surfaceRaised : ACMColors.primaryOrange)
                        .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(isEmpty)

                Button {
                    viewModel.clearWebinarInviteCode()
                    webinarInviteCodeInput = ""
                } label: {
                    Text("Remove")
                        .font(ACMFont.trial(14, weight: .medium))
                        .foregroundStyle(viewModel.state.webinarRequiresInviteCode ? ACMColors.error : ACMColors.textFaint)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .acmColorBackground(ACMColors.surfaceRaised)
                        .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(!viewModel.state.webinarRequiresInviteCode)
            }
        }
        .padding(ACMSpacing.sm)
    }

    @ViewBuilder
    private func webinarLinkRow() -> some View {
        VStack(alignment: .leading, spacing: ACMSpacing.sm) {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: "link",
                    androidIcon: "link",
                    tint: viewModel.state.webinarLinkSlug == nil ? ACMColors.textMuted : ACMColors.primaryOrange,
                    androidTint: viewModel.state.webinarLinkSlug == nil ? "muted" : "accent"
                )

                Text("Webinar link")
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(ACMColors.text)
                    .lineLimit(1)

                Spacer()
            }

            Text(viewModel.state.webinarLinkURL ?? webinarLinkLabel)
                .font(ACMFont.trial(13))
                .foregroundStyle(ACMColors.textFaint)
                .lineLimit(1)
                .padding(.horizontal, ACMSpacing.sm)
                .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
                .acmColorBackground(ACMColors.surfaceRaised)
                .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))

            TextField("", text: Binding(
                get: { webinarLinkCodeInput },
                set: { webinarLinkCodeInput = sanitizeWebinarLinkCode($0) }
            ), prompt: Text("custom-link").foregroundStyle(ACMColors.textFaint))
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
                .padding(.horizontal, ACMSpacing.sm)
                .frame(height: 40)
                .acmColorBackground(ACMColors.surfaceRaised)
                .overlay {
                    RoundedRectangle(cornerRadius: ACMRadius.sm)
                        .strokeBorder(lineWidth: 1)
                        .foregroundStyle(ACMColors.border)
                }
                .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))

            HStack(spacing: ACMSpacing.sm) {
                Button {
                    viewModel.setWebinarLinkSlug(sanitizedWebinarLinkInput)
                    webinarLinkCodeInput = sanitizedWebinarLinkInput
                    isConfirmingWebinarLinkRotation = false
                } label: {
                    Text("Set link")
                        .font(ACMFont.trial(14, weight: .medium))
                        .foregroundStyle(!isWebinarLinkInputValid || sanitizedWebinarLinkInput.isEmpty ? ACMColors.textFaint : Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .acmColorBackground(!isWebinarLinkInputValid || sanitizedWebinarLinkInput.isEmpty ? ACMColors.surfaceRaised : ACMColors.primaryOrange)
                        .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(!isWebinarLinkInputValid || sanitizedWebinarLinkInput.isEmpty)

                Button {
                    viewModel.clearWebinarLinkSlug()
                    webinarLinkCodeInput = ""
                    isConfirmingWebinarLinkRotation = false
                } label: {
                    Text("Clear")
                        .font(ACMFont.trial(14, weight: .medium))
                        .foregroundStyle(viewModel.state.webinarLinkSlug == nil ? ACMColors.textFaint : ACMColors.error)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .acmColorBackground(ACMColors.surfaceRaised)
                        .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.state.webinarLinkSlug == nil)
            }

            HStack(spacing: ACMSpacing.sm) {
                Button {
                    Task {
                        if let link = await viewModel.copyableWebinarLink() {
                            isConfirmingWebinarLinkRotation = false
                            copyWebinarLink(link)
                        }
                    }
                } label: {
                    Text(didCopyWebinarLink ? "Copied" : (viewModel.state.webinarLinkSlug == nil ? "Generate" : "Copy"))
                        .font(ACMFont.trial(14, weight: .medium))
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .acmColorBackground(didCopyWebinarLink ? ACMColors.success : ACMColors.primaryOrange)
                        .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                }
                .buttonStyle(.plain)

                if isConfirmingWebinarLinkRotation {
                    Button {
                        Task {
                            if let link = await viewModel.rotateWebinarLink() {
                                webinarLinkCodeInput = viewModel.state.webinarLinkSlug ?? ""
                                isConfirmingWebinarLinkRotation = false
                                copyWebinarLink(link)
                            }
                        }
                    } label: {
                        Text("Confirm")
                            .font(ACMFont.trial(14, weight: .medium))
                            .foregroundStyle(Color.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .acmColorBackground(ACMColors.error)
                            .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                    }
                    .buttonStyle(.plain)

                    Button {
                        isConfirmingWebinarLinkRotation = false
                    } label: {
                        Text("Cancel")
                            .font(ACMFont.trial(14, weight: .medium))
                            .foregroundStyle(ACMColors.text)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .acmColorBackground(ACMColors.surfaceRaised)
                            .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                    }
                    .buttonStyle(.plain)
                } else if viewModel.state.webinarLinkSlug != nil {
                    Button {
                        isConfirmingWebinarLinkRotation = true
                    } label: {
                        Text("Rotate")
                            .font(ACMFont.trial(14, weight: .medium))
                            .foregroundStyle(ACMColors.text)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .acmColorBackground(ACMColors.surfaceRaised)
                            .clipShape(RoundedRectangle(cornerRadius: ACMRadius.sm))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(ACMSpacing.sm)
    }

    private var webinarLinkLabel: String {
        if let slug = viewModel.state.webinarLinkSlug, !slug.isEmpty {
            return "/w/\(slug)"
        }
        return "No link generated"
    }

    private func sanitizeWebinarLinkCode(_ value: String) -> String {
        let allowed = "abcdefghijklmnopqrstuvwxyz0123456789-"
        var sanitized = ""
        for character in value.lowercased() {
            if allowed.contains(character) {
                sanitized += String(character)
                if sanitized.count >= 32 {
                    break
                }
            }
        }
        return sanitized
    }

    private func copyWebinarLink(_ link: String) {
        #if !SKIP
#if canImport(UIKit)
        UIPasteboard.general.string = link
#endif
        HapticManager.shared.trigger(.success)
        #else
        ClipboardHelper.copyToClipboard(text: link, label: "Webinar link")
        #endif
        webinarLinkCopyFeedbackGeneration += 1
        let generation = webinarLinkCopyFeedbackGeneration
        didCopyWebinarLink = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            guard webinarLinkCopyFeedbackGeneration == generation else { return }
            didCopyWebinarLink = false
        }
    }

    @ViewBuilder
    private func displayNameRow() -> some View {
        HStack(spacing: ACMSpacing.sm) {
            MeetingSheetIconBox(
                icon: "person.crop.circle",
                androidIcon: "account",
                tint: ACMColors.textMuted,
                androidTint: "muted"
            )

            TextField("", text: $displayNameInput, prompt: Text("Display name").foregroundStyle(ACMColors.textFaint))
                .textFieldStyle(.plain)
                .font(ACMFont.trial(15))
                .foregroundStyle(ACMColors.text)
                .tint(ACMColors.primaryOrange)
#if !SKIP
#if os(iOS)
                .textInputAutocapitalization(.words)
#endif
#endif
                .autocorrectionDisabled(true)
                .onAppear {
                    displayNameInput = viewModel.state.displayName
                }
        }
        .padding(.horizontal, ACMSpacing.sm)
        .frame(height: 52)
    }

    @ViewBuilder
    private func updateDisplayNameRow() -> some View {
        Button {
            viewModel.updateDisplayName(displayNameInput)
        } label: {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: "paperplane.fill",
                    androidIcon: "send",
                    tint: isDisplayNameEmpty ? ACMColors.textFaint : Color.white,
                    androidTint: isDisplayNameEmpty ? "faint" : "white",
                    background: isDisplayNameEmpty ? ACMColors.surfaceRaised : ACMColors.primaryOrange
                )

                Text("Update display name")
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(isDisplayNameEmpty ? ACMColors.textFaint : ACMColors.text)
                    .lineLimit(1)

                Spacer()
            }
            .padding(.horizontal, ACMSpacing.sm)
            .frame(height: 52)
            .frame(maxWidth: .infinity, alignment: .leading)
#if !SKIP
            .contentShape(Rectangle())
#endif
        }
        .buttonStyle(.plain)
        .disabled(isDisplayNameEmpty)
        .opacity(isDisplayNameEmpty ? 0.62 : 1.0)
    }

    @ViewBuilder
    private func microphoneInputRow() -> some View {
        let inputs = viewModel.availableAudioInputs()
        HStack(spacing: ACMSpacing.sm) {
            MeetingSheetIconBox(
                icon: "mic.fill",
                androidIcon: "mic",
                tint: ACMColors.textMuted,
                androidTint: "muted"
            )

            rowLabel("Microphone")

            Spacer()

            Picker("", selection: Binding(
                get: { viewModel.currentAudioInputId() ?? "" },
                set: { next in
                    if !next.isEmpty {
                        viewModel.setAudioInput(next)
                    }
                }
            )) {
                ForEach(inputs) { device in
                    Text(device.label).tag(device.id)
                }
            }
            .tint(ACMColors.primaryOrange)
            .disabled(inputs.isEmpty)
        }
        .padding(.horizontal, ACMSpacing.sm)
        .frame(height: 52)
    }

    @ViewBuilder
    private func audioOutputRow() -> some View {
        let outputs = viewModel.availableAudioOutputs()
        HStack(spacing: ACMSpacing.sm) {
            MeetingSheetIconBox(
                icon: "speaker.wave.2.fill",
                androidIcon: "volume",
                tint: ACMColors.textMuted,
                androidTint: "muted"
            )

            rowLabel("Speaker")

            Spacer()

            Picker("", selection: Binding(
                get: { viewModel.currentAudioOutputId() ?? "" },
                set: { next in
                    if !next.isEmpty {
                        viewModel.setAudioOutput(next)
                    }
                }
            )) {
                ForEach(outputs) { device in
                    Text(device.label).tag(device.id)
                }
            }
            .tint(ACMColors.primaryOrange)
            .disabled(outputs.isEmpty)
        }
        .padding(.horizontal, ACMSpacing.sm)
        .frame(height: 52)
    }

    @ViewBuilder
    private func testSpeakerRow() -> some View {
        Button {
            viewModel.testSpeaker()
        } label: {
            HStack(spacing: ACMSpacing.sm) {
                MeetingSheetIconBox(
                    icon: "speaker.wave.2.fill",
                    androidIcon: "volume",
                    tint: ACMColors.primaryOrange,
                    androidTint: "accent"
                )

                Text("Test speaker")
                    .font(ACMFont.trial(15, weight: .medium))
                    .foregroundStyle(ACMColors.text)
                    .lineLimit(1)

                Spacer()
            }
            .padding(.horizontal, ACMSpacing.sm)
            .frame(height: 52)
            .frame(maxWidth: .infinity, alignment: .leading)
#if !SKIP
            .contentShape(Rectangle())
#endif
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func qualityRow() -> some View {
        HStack(spacing: ACMSpacing.sm) {
            MeetingSheetIconBox(
                icon: "video.fill",
                androidIcon: "video",
                tint: ACMColors.textMuted,
                androidTint: "muted"
            )

            rowLabel("Quality")

            Spacer()

            Picker("", selection: Binding(
                get: { viewModel.state.videoQuality },
                set: { next in
                    viewModel.setVideoQuality(next)
                }
            )) {
                Text("Standard").tag(VideoQuality.standard)
                Text("Low").tag(VideoQuality.low)
            }
            .tint(ACMColors.primaryOrange)
        }
        .padding(.horizontal, ACMSpacing.sm)
        .frame(height: 52)
    }

    @ViewBuilder
    private var settingsContent: some View {
        switch page {
        case .overview:
            overviewContent
        case .room:
            roomSettingsContent
        case .webinar:
            webinarSection()
        case .profile:
            profileSettingsContent
        case .audioVideo:
            audioVideoSettingsContent
        case .videoQuality:
            videoQualitySettingsContent
        }
    }

    @ViewBuilder
    private var overviewContent: some View {
        if viewModel.state.isAdmin {
            VStack(alignment: .leading, spacing: ACMSpacing.xs) {
                acmListSectionHeader("Host controls")

                MeetingSheetSectionCard {
                    settingsNavigationRow(
                        "Room controls",
                        subtitle: viewModel.state.meetingRequiresInviteCode ? "Invite code required" : "Locks, guests, chat, invite code",
                        icon: viewModel.state.isRoomLocked ? "lock.fill" : "lock.open.fill",
                        androidIcon: viewModel.state.isRoomLocked ? "lock" : "lock.open",
                        isActive: viewModel.state.isRoomLocked || viewModel.state.isChatLocked || viewModel.state.isNoGuests || viewModel.state.meetingRequiresInviteCode
                    ) {
                        onOpenRoomSettings?()
                    }
                    MoreRowDivider()
                    settingsNavigationRow(
                        "Webinar",
                        subtitle: viewModel.state.isWebinarEnabled ? "\(viewModel.state.webinarAttendeeCount) attendees" : "Mode, access, links",
                        icon: "person.2.fill",
                        androidIcon: "participants",
                        isActive: viewModel.state.isWebinarEnabled
                    ) {
                        onOpenWebinarSettings?()
                    }
                }
            }
        }

        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Personal")

            MeetingSheetSectionCard {
                settingsNavigationRow(
                    "Profile",
                    subtitle: viewModel.state.displayName.isEmpty ? "Display name" : viewModel.state.displayName,
                    icon: "person.crop.circle",
                    androidIcon: "account"
                ) {
                    onOpenProfileSettings?()
                }
                MoreRowDivider()
                settingsNavigationRow(
                    "Audio and video",
                    subtitle: viewModel.state.mediaPublishingDisabled ? "Publishing disabled" : "Mic, camera, speaker",
                    icon: viewModel.state.isMuted ? "mic.slash.fill" : "mic.fill",
                    androidIcon: viewModel.state.isMuted ? "mic.off" : "mic",
                    isActive: !viewModel.state.isMuted || !viewModel.state.isCameraOff
                ) {
                    onOpenAudioVideoSettings?()
                }
                MoreRowDivider()
                settingsNavigationRow(
                    "Video quality",
                    subtitle: viewModel.state.videoQuality == .low ? "Low bandwidth" : "Standard",
                    icon: "video.fill",
                    androidIcon: "video",
                    isActive: viewModel.state.videoQuality == .low
                ) {
                    onOpenVideoQualitySettings?()
                }
            }
        }
    }

    @ViewBuilder
    private var roomSettingsContent: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Access")

            MeetingSheetSectionCard {
                settingsToggleRow(
                    "Lock room",
                    icon: viewModel.state.isRoomLocked ? "lock.fill" : "lock.open.fill",
                    androidIcon: viewModel.state.isRoomLocked ? "lock" : "lock.open",
                    isOn: Binding(
                        get: { viewModel.state.isRoomLocked },
                        set: { next in
                            if next != viewModel.state.isRoomLocked {
                                viewModel.toggleRoomLock()
                            }
                        }
                    ),
                    isActive: viewModel.state.isRoomLocked
                )
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                settingsToggleRow(
                    "Lock chat",
                    icon: "message.fill",
                    androidIcon: "chat",
                    isOn: Binding(
                        get: { viewModel.state.isChatLocked },
                        set: { next in
                            if next != viewModel.state.isChatLocked {
                                viewModel.toggleChatLock()
                            }
                        }
                    ),
                    isActive: viewModel.state.isChatLocked
                )
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                settingsToggleRow(
                    "Block guests",
                    icon: "nosign",
                    androidIcon: "block",
                    isOn: Binding(
                        get: { viewModel.state.isNoGuests },
                        set: { next in
                            if next != viewModel.state.isNoGuests {
                                viewModel.toggleNoGuests()
                            }
                        }
                    ),
                    isActive: viewModel.state.isNoGuests
                )
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                settingsToggleRow(
                    "Direct messages",
                    icon: "bubble.left.and.bubble.right.fill",
                    androidIcon: "forum",
                    isOn: Binding(
                        get: { viewModel.state.isDmEnabled },
                        set: { next in
                            if next != viewModel.state.isDmEnabled {
                                viewModel.toggleDmEnabled()
                            }
                        }
                    ),
                    isActive: viewModel.state.isDmEnabled
                )
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                settingsToggleRow(
                    "Read messages aloud",
                    icon: viewModel.state.isTtsDisabled ? "speaker.slash.fill" : "speaker.wave.2.fill",
                    androidIcon: viewModel.state.isTtsDisabled ? "volume.off" : "volume",
                    isOn: Binding(
                        get: { !viewModel.state.isTtsDisabled },
                        set: { next in
                            if next == viewModel.state.isTtsDisabled {
                                viewModel.toggleTtsDisabled()
                            }
                        }
                    ),
                    isActive: !viewModel.state.isTtsDisabled
                )
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                meetingInviteCodeRow()
            }
        }
    }

    @ViewBuilder
    private var profileSettingsContent: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Profile")

            MeetingSheetSectionCard {
                displayNameRow()
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                updateDisplayNameRow()
            }
        }
    }

    @ViewBuilder
    private var audioVideoSettingsContent: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Audio and video")

            MeetingSheetSectionCard {
                settingsToggleRow(
                    "Microphone",
                    icon: viewModel.state.isMuted ? "mic.slash.fill" : "mic.fill",
                    androidIcon: viewModel.state.isMuted ? "mic.off" : "mic",
                    isOn: Binding(
                        get: { !viewModel.state.isMuted },
                        set: { next in
                            let shouldMute = !next
                            if shouldMute != viewModel.state.isMuted {
                                viewModel.toggleMute()
                            }
                        }
                    ),
                    isActive: !viewModel.state.isMuted,
                    isDisabled: viewModel.state.mediaPublishingDisabled
                )
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                settingsToggleRow(
                    "Camera",
                    icon: viewModel.state.isCameraOff ? "video.slash.fill" : "video.fill",
                    androidIcon: viewModel.state.isCameraOff ? "video.off" : "video",
                    isOn: Binding(
                        get: { !viewModel.state.isCameraOff },
                        set: { next in
                            let shouldDisable = !next
                            if shouldDisable != viewModel.state.isCameraOff {
                                viewModel.toggleCamera()
                            }
                        }
                    ),
                    isActive: !viewModel.state.isCameraOff,
                    isDisabled: viewModel.state.mediaPublishingDisabled
                )
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                microphoneInputRow()
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                audioOutputRow()
                MeetingSheetRowDivider(inset: ACMSpacing.sm + 32 + ACMSpacing.sm)
                testSpeakerRow()
            }
        }
    }

    @ViewBuilder
    private var videoQualitySettingsContent: some View {
        VStack(alignment: .leading, spacing: ACMSpacing.xs) {
            acmListSectionHeader("Video")

            MeetingSheetSectionCard {
                qualityRow()
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            MeetingSheetHeader(title: title, onBack: onBack, onDone: { dismiss() })

            if bodyReady {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: ACMSpacing.md) {
                    settingsContent
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
        .frame(maxWidth: .infinity, alignment: .top)
        #else
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        #endif
        .onAppear {
            if viewModel.state.isAdmin {
                viewModel.refreshMeetingConfig()
                viewModel.refreshWebinarConfig()
                syncWebinarDraftsFromState()
            }
        }
        .onDisappear {
            webinarLinkCopyFeedbackGeneration += 1
            didCopyWebinarLink = false
            isConfirmingWebinarLinkRotation = false
        }
        .onChange(of: viewModel.state.webinarMaxAttendees) { _, _ in
            syncWebinarCapacityDraftFromState()
        }
        .onChange(of: viewModel.state.webinarLinkSlug) { _, _ in
            syncWebinarLinkDraftFromState()
            isConfirmingWebinarLinkRotation = false
        }
    }
}
