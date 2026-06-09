package conclave.module

import android.content.Intent
import skip.foundation.ProcessInfo

/// Bridges the shared SwiftUI MeetingViewModel (transpiled into this same
/// conclave.module package) to the Android ongoing-call foreground service.
/// The VM's `#if SKIP` branch calls these directly when a call starts / ends /
/// the mute state changes.
///
/// The CallForegroundService is what keeps the call alive while the app is
/// backgrounded (foregroundServiceType microphone|mediaPlayback) and shows the
/// persistent Leave + Mute/unmute notification that deep-links back into the
/// meeting.
object CallNotificationBridge {

    /// Start (or refresh) the ongoing-call foreground service + notification.
    fun startCall(muted: Boolean) {
        val ctx = ProcessInfo.processInfo.androidContext
        val intent = Intent(ctx, CallForegroundService::class.java).apply {
            action = CallForegroundService.ACTION_START
            putExtra(CallForegroundService.EXTRA_MUTED, muted)
        }
        try {
            ctx.startForegroundService(intent)
        } catch (t: Throwable) {
            android.util.Log.e("ConclaveCall", "startForegroundService(call) failed", t)
        }
    }

    /// Update the notification's Mute/unmute action + text to match the call.
    fun updateMuted(muted: Boolean) {
        val ctx = ProcessInfo.processInfo.androidContext
        val intent = Intent(ctx, CallForegroundService::class.java).apply {
            action = CallForegroundService.ACTION_UPDATE
            putExtra(CallForegroundService.EXTRA_MUTED, muted)
        }
        try {
            ctx.startService(intent)
        } catch (_: Throwable) {
        }
    }

    /// Stop the ongoing-call service + remove the notification (call ended).
    fun stopCall() {
        val ctx = ProcessInfo.processInfo.androidContext
        val intent = Intent(ctx, CallForegroundService::class.java).apply {
            action = CallForegroundService.ACTION_STOP
        }
        try {
            ctx.startService(intent)
        } catch (_: Throwable) {
        }
    }
}
