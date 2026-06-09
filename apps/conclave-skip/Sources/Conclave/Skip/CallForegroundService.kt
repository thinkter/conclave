package conclave.module

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/// The ongoing-call foreground service. While the user is in a meeting this is
/// what keeps the call alive when the app is backgrounded — it runs with
/// foregroundServiceType `microphone|mediaPlayback` (declared in the manifest)
/// so the OS does not kill the audio path, and it shows a persistent
/// notification with Leave + Mute/unmute actions that deep-link back into the
/// meeting (tap the body to return).
///
/// Actions are delivered to CallActionReceiver, which forwards them to the
/// active MeetingViewModel via CallActionDispatcher.
class CallForegroundService : Service() {
    companion object {
        const val CHANNEL_ID = "conclave_call_channel"
        const val NOTIFICATION_ID = 1

        const val ACTION_START = "conclave.app.action.START_CALL"
        const val ACTION_STOP = "conclave.app.action.STOP_CALL"
        const val ACTION_UPDATE = "conclave.app.action.UPDATE_CALL"
        const val EXTRA_MUTED = "muted"
    }

    private var currentMuted: Boolean = true

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_UPDATE -> {
                currentMuted = intent.getBooleanExtra(EXTRA_MUTED, currentMuted)
                // Re-post the SAME notification id to update the Mute action +
                // text without re-foregrounding.
                val manager = getSystemService(NotificationManager::class.java)
                manager.notify(NOTIFICATION_ID, buildNotification())
                return START_STICKY
            }
            ACTION_START -> {
                currentMuted = intent.getBooleanExtra(EXTRA_MUTED, currentMuted)
                // Android 14+ throws if a MICROPHONE foreground-service type is
                // started while RECORD_AUDIO isn't granted. In a call the mic is
                // normally granted, but guard it: fall back to MEDIA_PLAYBACK-only
                // so the background-call service + notification still come up
                // (you can still hear others) instead of the service dying.
                val micGranted = androidx.core.content.ContextCompat.checkSelfPermission(
                    this, android.Manifest.permission.RECORD_AUDIO
                ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                try {
                    if (Build.VERSION.SDK_INT >= 30) {
                        val type = if (micGranted) {
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                        } else {
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                        }
                        startForeground(NOTIFICATION_ID, buildNotification(), type)
                    } else if (Build.VERSION.SDK_INT >= 29) {
                        if (micGranted) {
                            startForeground(
                                NOTIFICATION_ID,
                                buildNotification(),
                                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                            )
                        } else {
                            startForeground(NOTIFICATION_ID, buildNotification())
                        }
                    } else {
                        startForeground(NOTIFICATION_ID, buildNotification())
                    }
                } catch (t: Throwable) {
                    android.util.Log.e("ConclaveCall", "startForeground(call) FAILED", t)
                    stopSelf()
                    return START_NOT_STICKY
                }
                return START_STICKY
            }
            else -> {
                return START_NOT_STICKY
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Ongoing call",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows while you're in a meeting"
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        // Tap the body to return to the meeting.
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val contentPending = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val muteLabel = if (currentMuted) "Unmute" else "Mute"
        val muteIcon = if (currentMuted) {
            android.R.drawable.ic_lock_silent_mode
        } else {
            android.R.drawable.ic_lock_silent_mode_off
        }
        val mutePending = PendingIntent.getBroadcast(
            this,
            1,
            Intent(this, CallActionReceiver::class.java).apply {
                action = CallActionReceiver.ACTION_TOGGLE_MUTE
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val leavePending = PendingIntent.getBroadcast(
            this,
            2,
            Intent(this, CallActionReceiver::class.java).apply {
                action = CallActionReceiver.ACTION_LEAVE
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Conclave")
            .setContentText(if (currentMuted) "In a meeting · Muted" else "In a meeting")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentIntent(contentPending)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setShowWhen(false)
            .addAction(muteIcon, muteLabel, mutePending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Leave", leavePending)
            .build()
    }
}

/// Receives the notification (and PiP) Leave / Mute actions and forwards them to
/// the active MeetingViewModel through CallActionDispatcher.
class CallActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_TOGGLE_MUTE = "conclave.app.action.CALL_TOGGLE_MUTE"
        const val ACTION_LEAVE = "conclave.app.action.CALL_LEAVE"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TOGGLE_MUTE -> CallActionDispatcher.toggleMute()
            ACTION_LEAVE -> CallActionDispatcher.leave()
        }
    }
}
