package conclave.module

import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicInteger

/// Routes call-control actions originating OUTSIDE the SwiftUI view tree (the
/// ongoing-call notification's Mute/Leave actions, and the Picture-in-Picture
/// RemoteActions) back to the active MeetingViewModel.
///
/// The transpiled MeetingViewModel registers its `toggleMute` / `leaveCall`
/// closures here while in a call (and clears them on leave). A notification
/// BroadcastReceiver or the PiP action receiver runs on a binder/main thread,
/// so every callback is hopped onto the main thread (the VM is @MainActor).
object CallActionDispatcher {
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile private var onToggleMute: (() -> Unit)? = null
    @Volatile private var onLeave: (() -> Unit)? = null
    private val generation = AtomicInteger(0)

    /// Registered by the VM when a call becomes active.
    fun register(mute: () -> Unit, leave: () -> Unit) {
        generation.incrementAndGet()
        onToggleMute = mute
        onLeave = leave
    }

    /// Cleared by the VM when the call ends.
    fun clear() {
        generation.incrementAndGet()
        onToggleMute = null
        onLeave = null
    }

    fun toggleMute() {
        val action = onToggleMute ?: return
        val actionGeneration = generation.get()
        mainHandler.post {
            if (generation.get() == actionGeneration && onToggleMute === action) {
                action()
            }
        }
    }

    fun leave() {
        val action = onLeave ?: return
        val actionGeneration = generation.get()
        mainHandler.post {
            if (generation.get() == actionGeneration && onLeave === action) {
                action()
            }
        }
    }
}
