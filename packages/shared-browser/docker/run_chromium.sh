#!/bin/bash

start_chromium() {
    echo "Starting Chromium..."
    if [[ -n "${PULSE_SERVER:-}" ]]; then
        socket="${PULSE_SERVER#unix:}"
        for i in {1..20}; do
            if [[ -S "$socket" ]]; then
                break
            fi
            sleep 0.2
        done
    fi
    local flags=(
        "--no-sandbox"
        "--disable-dev-shm-usage"
        "--no-first-run"
        "--autoplay-policy=no-user-gesture-required"
        "--enable-gpu-rasterization"
        "--use-gl=egl"
        "--enable-zero-copy"
        "--enable-native-gpu-memory-buffers"
        "--ignore-gpu-blacklist"
        "--enable-features=UsePulseAudio"
        "--disable-background-networking"
        "--disable-sync"
        "--disable-translate"
        "--disable-extensions"
        "--disable-default-apps"
        "--disable-features=TranslateUI"
        "--no-zygote"
        "--window-size=1280,720"
    )

    if [[ -d /dev/dri && -c /dev/dri/card0 ]]; then
        flags+=( "--ozone-platform=wayland" "--enable-features=UseOzonePlatform" )
    else
        flags+=( "--disable-gpu" "--disable-software-rasterizer" )
    fi

    if [[ -n "${CHROME_EXTRA_FLAGS:-}" ]]; then
        read -r -a extra <<<"$CHROME_EXTRA_FLAGS"
        flags+=( "${extra[@]}" )
    fi

    /usr/bin/chromium "${flags[@]}" "${START_URL:-about:blank}"
}

while true; do
    start_chromium
    echo "Chromium exited (exit code $?). Restarting in 1 second..."
    sleep 1
done
