
import pygame
import time
import os
import sys

SONG_FILE = "ako_ang_bagyo.mp3"

# Typing animation speed
TYPING_SPEED = 0.085

# Lyrics and timestamps (seconds from song start)
lyrics = [
    (115.0, "Matakot na kayo"),
    (119.0, "Ako, ako, ako ang bagyo"),

    (125.0, "Kulimlim ng langit sa inyong dalawa"),
    (132.0, "Bulong ko sa hangin \"sana 'di kayo masaya\""),
    (140.0, "Sa tibay ng bahay na titirhan niyo"),
    (147.0, "Tatangayin ko bawat yero"),
    (153.0, "Dahil ako, ako ang bagyo"),

    (161.0, "Dilim ng paligid buhos ng emosyon"),
    (168.0, "Tunog ng pag-ibig sa sama ng panahon"),
    (174.0, "Sa tibay ng bahay na titirhan niyo"),
    (179.0, "Gigibain ko mga pader niyo"),
    (181.0, "Dahil ako, ako ang bagyo")
]


def typewriter(text):
    for char in text:
        sys.stdout.write(char)
        sys.stdout.flush()
        time.sleep(TYPING_SPEED)

    print()


def wait_until(target, start):
    while True:
        remaining = target - (time.perf_counter() - start)

        if remaining <= 0:
            break

        time.sleep(min(remaining, 0.01))


def main():

    if not os.path.exists(SONG_FILE):
        print("MP3 file not found!")
        return

    pygame.mixer.init()
    pygame.mixer.music.load(SONG_FILE)

    # Play music from the beginning
    pygame.mixer.music.play()

    start = time.perf_counter()

    try:
        for timestamp, lyric in lyrics:

            wait_until(timestamp, start)

            typewriter(lyric)

        wait_until(183, start)

    except KeyboardInterrupt:
        print("\nStopped.")

    finally:
        pygame.mixer.music.stop()
        pygame.mixer.quit()


if __name__ == "__main__":
    main()
