# Extra audio credits (sword / line / rock / laser / underwater / creature / UI-foley set)

47 clips added on top of the set in `FISHTOP-CREDITS.md`. Every one is cut from a **recording** published on
OpenGameArt.org under **CC0 1.0** (the only licence on each page; checked on each content page's "License(s)"
field). `boss_growl1` is also a US Fish & Wildlife Service recording, which is US public domain. Credit is given anyway, with thanks.

## Processing (all clips)

- Decoded, downmixed to mono, resampled to 32 kHz, encoded as OGG Vorbis (q3), metadata stripped.
- One-shots: leading silence cut (~3 ms before the first sample above -40 dB of peak); tail cut where the 10 ms RMS falls
  50 dB below its maximum, with a short fade-out. Then peak-normalised to -1 dBFS, with the gain capped so that the
  loudest 400 ms window stays at or below -14 dBFS RMS (loud tonal clips end up below -1 dBFS peak).
- Loops (`uw_amb1`, `laser_beam1`): built to loop seamlessly (see below) and normalised to about -22 / -18 dBFS RMS.
- Per-clip filtering (high-pass / low-pass, `asetrate` pitch shifts, excerpts) is listed in the table. "rate x0.8"
  means the clip is resampled to play at 0.8x speed, so it is lower in pitch and longer; "rate x1.5" means higher and shorter.
- Every file is mono 32 kHz. The largest is under 30 KB, and the 47 files total about 0.5 MB.

## Clips

| Clip | Loop | What it is | Source pack / file | Author | OGA page | Licence | Processing |
|---|---|---|---|---|---|---|---|
| sw_swish1 | | light stick swish | "Swish - bamboo stick weapon swhoshes" / swosh-17 | qubodup | https://opengameart.org/content/swish-bamboo-stick-weapon-swhoshes | CC0 | HP 180 Hz (x2) to thin it to a small-blade swish |
| sw_swish2 | | light stick swish | same / swosh-22 | qubodup | same | CC0 | HP 180 Hz (x2) |
| sw_swish3 | | light stick swish | same / swosh-15 | qubodup | same | CC0 | HP 180 Hz (x2) |
| sw_slash1 | | knife-on-blade slide ("shing") | "Fantasy Weapons and Apparel SFX Library" / sword-knife-clash-24 | Vehicle (Jan Schupke) | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | CC0 | HP 150 Hz |
| sw_slash2 | | short knife scrape | "Fantasy Sound Effects (Tinysized SFX)" / handsaw-knife-scrape-02 | Vehicle (Jan Schupke) | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | CC0 | HP 150 Hz |
| sw_clang1 | | small blade clash | "Fantasy Weapons and Apparel SFX Library" / sword-knife-clash-14 | Vehicle | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | CC0 | HP 120 Hz |
| sw_clang2 | | small blade clash | same / sword-knife-clash-16 | Vehicle | same | CC0 | HP 120 Hz |
| sw_parry1 | | bright ringing blade ping | same / sword-knife-clash-29 | Vehicle | same | CC0 | HP 300 Hz, max 0.7 s |
| rope_creak1 | | leather/rope creak under load | same / quiver-leather-squeeze-04 | Vehicle | same | CC0 | HP 80 Hz |
| rope_strain1 | | bowstring and limb creak while drawing (line tension) | "Medieval sound effects - Weapon Textures" / English Longbow Draw.wav, 2.35-4.25 s | Ben Jaszczak & Brian Nelson (Still North Media), submitted by MedicineStorm | https://opengameart.org/content/medieval-sound-effects-weapon-textures | CC0 | excerpt, HP 60 Hz, 250 ms fade-out |
| rope_snap1 | | bowstring release snap (line snapping) | same / English Longbow Shoot.wav, 4th take (1.22-1.77 s) | Still North Media | same | CC0 | excerpt, HP 60 Hz |
| rope_twang1 | | short spring twang | "Spring sounds" / door spring - Region #5 | bart | https://opengameart.org/content/spring-sounds | CC0 | HP 60 Hz |
| rope_twang2 | | ringing spring "sproing" (vibrating line) | same / door spring - Region #1 | bart | same | CC0 | first 1.3 s, HP 80 Hz, 350 ms fade-out |
| line_zip1 | | arrow whizz-by (fast line zip) | "Medieval sound effects - Weapon Textures" / Scythian Recurve Arrow Passby.wav, last take (3.30-3.72 s) | Still North Media | https://opengameart.org/content/medieval-sound-effects-weapon-textures | CC0 | excerpt, HP 150 Hz |
| rock_hit1 | | small stone knock | "75 CC0 breaking / falling / hit sfx" / bfh1_rock_hit_01 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 | trim/normalise only |
| rock_hit2 | | stone drop, lower | same / bfh1_rock_falling_02 | rubberduck | same | CC0 | trim/normalise only |
| rock_crumble1 | | rock breaking apart | same / bfh1_rock_breaking_02 | rubberduck | same | CC0 | trim/normalise only |
| rock_crumble2 | | big rumbling crumble / cave-in (turn to stone) | "Cave In" | StarNinjas | https://opengameart.org/content/cave-in | CC0 | first 2.6 s, HP 40 Hz, 800 ms fade-out |
| thud_heavy1 | | heavy low thud | "75 CC0 breaking / falling / hit sfx" / bfh1_hit_07 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 | trim/normalise only |
| gravel1 | | gravel crunch (step) | "Different steps on wood, stone, leaves, gravel and mud" / gravel.ogg | TinyWorlds | https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud | CC0 | normalise only |
| laser_beam1 | yes | sustained laser-eye beam with crackle | "Theremin Laser SFX" / Long/Spirit 6 + "Electricity Sound Effects" / continuousspark.wav | Zane Little Music; BMacZero | https://opengameart.org/content/theremin-laser-sfx ; https://opengameart.org/content/electricity-sound-effects-0 | CC0 | theremin take at rate x0.6, swell flattened, steady 1 s section looped forward then backward (cut at waveform peaks); Tesla-spark crackle (HP 1.5 kHz) tiled underneath at -12 dB; 2.0 s seamless loop |
| laser_shot1 | | short "pew" | "Theremin Laser SFX" / Short/Hyper 6 | Zane Little Music | https://opengameart.org/content/theremin-laser-sfx | CC0 | trim/normalise only |
| charge1 | | rising charge-up tone | same / Up/Spirit 2 | Zane Little Music | same | CC0 | 80 ms fade-out |
| magic_whoosh1 | | whoosh plus rising shimmer (power/magic) | bamboo swosh-20 + Theremin Up/Space 3 | qubodup; Zane Little Music | https://opengameart.org/content/swish-bamboo-stick-weapon-swhoshes ; https://opengameart.org/content/theremin-laser-sfx | CC0 | swish HP 200 Hz (x2), theremin layered 20 ms later at -7 dB |
| zap1 | | single Tesla-coil spark | "Electricity Sound Effects" / spark.wav | BMacZero | https://opengameart.org/content/electricity-sound-effects-0 | CC0 | HP 200 Hz |
| zap2 | | stun-gun discharge buzz | "Fantasy Sound Effects (Tinysized SFX)" / paralyzer-discharge-01 | Vehicle | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | CC0 | first 0.6 s, HP 200 Hz |
| uw_amb1 | yes | muffled underwater current bed | "Park ambiences" / park_ambience_river.wav (small river over a step), 20-34.5 s | Thimras | https://opengameart.org/content/park-ambiences | CC0 | HP 30 Hz, LP 380 Hz (x2) + 600 Hz (birds and frogs removed, so it sounds submerged); 12 s loop with a 2 s equal-power crossfade |
| uw_rumble1 | | deep underwater rumble/boom | "25 CC0 bang / firework SFX" / cannon_02 | rubberduck | https://opengameart.org/content/25-cc0-bang-firework-sfx | CC0 | rate x0.55, LP 260 Hz (x2), 400 ms fade-out |
| boom_uw1 | | small muffled underwater explosion | same / bang_03 | rubberduck | same | CC0 | rate x0.8, LP 600 Hz (x2), 250 ms fade-out |
| uw_thud1 | | muffled impact | "75 CC0 breaking / falling / hit sfx" / bfh1_hit_02 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 | rate x0.85, LP 450 Hz (x2) |
| hit_squish1 | | soft wet squishy hit | "8 wet squish, slurp impacts" / impactsplat07 | Independent.nu (submitted by qubodup) | https://opengameart.org/content/8-wet-squish-slurp-impacts | CC0 | HP 60 Hz |
| slap1 | | wet slap | "40 wet towel club/pound/hit/attack sounds" / wet_towel_on_body-06 | qubodup | https://opengameart.org/content/40-wet-towel-clubpoundhitattack-sounds | CC0 (page states CC0; the old txt inside the archive is superseded) | HP 60 Hz |
| chomp1 | | crunchy chomp | "Crunchy bite" | fvcalderan | https://opengameart.org/content/crunchy-bite | CC0 | HP 60 Hz |
| fish_squeak1 | | tiny squeak (small fish) | "Squeaky Rat" / qubodupSqueakyRatPain | qubodup (from freesound #143125 by Zabuhailo, CC0 at the time) | https://opengameart.org/content/squeaky-rat | CC0 | rate x1.15 |
| crab_click1 | | small double click (crab claw) | "87 Clickety Clips" / click77 | OwlishMedia | https://opengameart.org/content/87-clickety-clips | CC0 | HP 300 Hz |
| crab_snip1 | | scissor snip (pincer) | "Fantasy Sound Effects (Tinysized SFX)" / scissors-close-01 | Vehicle | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | CC0 | HP 300 Hz |
| boss_growl1 | | real bear growl | "Bear Growls" / bear_02.flac (U.S. Fish & Wildlife Service recording) | AntumDeluge (source: USFWS) | https://opengameart.org/content/bear-growls | CC0 / US public domain | HP 40 Hz |
| boss_growl2 | | voiced monster growl, deepened | "16 Monster Growls" / monster.8 | StarNinjas | https://opengameart.org/content/16-monster-growls | CC0 | rate x0.8, HP 50 Hz |
| powerup1 | | rising guitar arpeggio power-up | "Sound effects made with an electric guitar" / power up.ogg | Spargus | https://opengameart.org/content/sound-effects-made-with-an-electric-guitar | CC0 | HP 120 Hz (x2) removes pick thumps; tail cut at -40 dB |
| pickup_sparkle1 | | tinkling glass bounces (sparkle) | "Fantasy Accessory SFX Library" / vial-glass-small-drop-01 | Vehicle | https://opengameart.org/content/fantasy-accessory-sfx-library | CC0 | rate x1.5, HP 900 Hz (x2) |
| bag_zip1 | | zipper (bag/backpack) | "Zipper" / zipper-1.wav | AntumDeluge | https://opengameart.org/content/zipper | CC0 | HP 100 Hz |
| buckle1 | | belt-buckle click | "Fantasy Weapons and Apparel SFX Library" / belt-buckle-01 | Vehicle | https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library | CC0 | HP 150 Hz |
| cloth1 | | cloth rustle | "RPG Sound Pack" / inventory/cloth.wav | artisticdude | https://opengameart.org/content/rpg-sound-pack | CC0 | HP 80 Hz |
| chain1 | | chain/chainmail rattle | same / inventory/chainmail2.wav | artisticdude | same | CC0 | HP 100 Hz |
| hook_clink1 | | small metal clink (hook) | same / inventory/metal-small2.wav | artisticdude | same | CC0 | HP 200 Hz |
| wood_knock1 | | wood knock | "Wood and Metal Sound Effects: Volume 2" / wood17.aif | Ogrebane | https://opengameart.org/content/wood-and-metal-sound-effects-volume-2 | CC0 | HP 80 Hz |
| heartbeat1 | | single heartbeat "lub-dub" (play repeatedly for low health) | "Heartbeat (single sound)" / heartbeat.mp3_.flac, 0.06-1.01 s | Independent.nu (submitted by qubodup) | https://opengameart.org/content/heartbeat-single-sound | CC0 | excerpt, HP 25 Hz, 80 ms fade-out |

Note: the laser clips come from a theremin. A theremin is an electronic instrument, but these are recordings of a
person playing one, not sounds generated in software. For the zaps, `zap1` is a real Tesla-coil spark and `zap2` is a real stun gun.
