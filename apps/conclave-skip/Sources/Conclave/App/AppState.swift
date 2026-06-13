import Foundation
import Observation
#if !SKIP
import SkipFuse
#endif

@MainActor
@Observable
final class AppState {
    static let shared = AppState()

    var isAuthenticated = false
    var currentUser: User?
    var authProvider: AuthProvider = .none
    var pendingJoinURLString: String?
    var pendingJoinRequestID = 0

    enum AuthProvider {
        case none
        case google
        case apple
        case guest
    }

    struct User: Identifiable {
        let id: String
        let name: String?
        let email: String?
        let provider: AuthProvider

        init(id: String, name: String? = nil, email: String? = nil, provider: AuthProvider = .guest) {
            self.id = id
            self.name = name
            self.email = email
            self.provider = provider
        }
    }

    func openJoinURL(_ url: URL) {
        openJoinURLString(url.absoluteString)
    }

    func openJoinURLString(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        pendingJoinURLString = trimmed
        pendingJoinRequestID += 1
    }

    func consumePendingJoinURLString() -> String? {
        guard let value = pendingJoinURLString, !value.isEmpty else { return nil }
        pendingJoinURLString = nil
        return value
    }
}

#if !SKIP
extension AppState: ObservableObject {}
#endif
