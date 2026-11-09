import {
  CarIcon,
  CrosshairIcon,
  Gamepad2Icon,
  PickaxeIcon,
  PlaneIcon,
  SwordsIcon,
  ZapIcon,
} from "lucide-react"

export const suggestions = [
  {
    icon: PickaxeIcon,
    label: "Voxel survival",
    prompt:
      "Make a survival game in a blocky world of grass, dirt, stone and trees. I explore in first person, punch blocks to break them and collect the materials, then place blocks to build a shelter. A day lasts a few minutes; at night the sky goes dark and slow monsters come out and chase me. My health drops when they hit me. I win by surviving three nights, and if my health hits zero I see how many nights I lasted and can start over.",
  },
  {
    icon: SwordsIcon,
    label: "Ink samurai duel",
    prompt:
      "Make a one-on-one samurai duel that looks like a brush-ink painting: off-white paper background, black ink figures, splashes of red when a hit lands. I face a single opponent on a windy bridge. I can step in and out, block, and slash, and a well-timed block opens them up for a counter. Each of us dies in two clean hits. The duel is best of three rounds, and the enemy gets faster and more aggressive each round. Show the round score in brush lettering and let me rematch at the end.",
  },
  {
    icon: ZapIcon,
    label: "Comic-book firefight",
    prompt:
      "Make a third-person shooter that looks like a comic book: bold black outlines, flat bright colors, halftone dot shading, and big onomatopoeia like BLAM and POW popping up on hits. I run through a city rooftop arena with a blaster while waves of goons pour in from the edges. Knocked-out goons sometimes drop health or a rapid-fire power-up. Clear five waves to win; if I go down, a comic panel shows 'THE END?' with my score and a button to try again.",
  },
  {
    icon: PlaneIcon,
    label: "Realistic battlefield",
    prompt:
      "Make a grounded first-person shooter on a muddy, overcast battlefield with trenches, sandbags, ruined farmhouses and drifting smoke. I carry a rifle with limited ammo and have to reload; recoil and bullet spread make aiming matter. Enemy soldiers take cover, move between positions and shoot back. My goal is to capture three flagged positions across the field by standing in them until they flip. Capture all three to win; die and the round ends with a summary of kills and positions taken.",
  },
  {
    icon: CrosshairIcon,
    label: "Fight-first shooter",
    prompt:
      "Make a fast arena shooter where I spawn straight into the action, no menus. The arena is a compact neon-lit space with jump pads, ramps and a few pillars for cover. I move quickly, can double jump and dash, and swap between a shotgun and a rocket launcher. Bots hunt me and each other. First to 15 eliminations wins the match; a live scoreboard shows everyone's count, and when it ends I see the final standings and can instantly play again.",
  },
  {
    icon: CarIcon,
    label: "Jungle expedition drive",
    prompt:
      "Make an off-road driving game through a dense jungle: tall trees, hanging vines, muddy tracks, river crossings and golden late-afternoon light through the canopy. I drive a rugged expedition truck that bounces and slides on rough ground. I have to reach a series of camp checkpoints before the timer runs out, and each checkpoint adds time. Crashing into trees or flipping costs me precious seconds to recover. Reach the final ancient temple to win; if the timer hits zero the expedition fails and I can retry.",
  },
  {
    icon: Gamepad2Icon,
    label: "Sunny kingdom platformer",
    prompt:
      "Make a cheerful 3D platformer set in a sunny kingdom of floating grassy islands, candy-colored castles, waterfalls and puffy clouds. I play a small round hero who runs, jumps and double jumps between platforms, some of which move or crumble. I collect shiny coins along the way and bop little wandering critters by landing on them. Touching a critter or falling off costs one of my three hearts. Reach the flag on top of the castle to win, with my coin total shown; lose all hearts and I restart the level.",
  },
]
