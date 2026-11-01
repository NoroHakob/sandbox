"use client"

import {
  ArrowUpIcon,
  CarIcon,
  ChevronDownIcon,
  CrosshairIcon,
  Gamepad2Icon,
  GripHorizontalIcon,
  PickaxeIcon,
  PlaneIcon,
  SwordsIcon,
  ZapIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

const suggestions = [
  { icon: PickaxeIcon, label: "Voxel survival" },
  { icon: SwordsIcon, label: "Ink samurai duel" },
  { icon: ZapIcon, label: "Comic-book firefight" },
  { icon: PlaneIcon, label: "Realistic battlefield" },
  { icon: CrosshairIcon, label: "Fight-first shooter" },
  { icon: CarIcon, label: "Jungle expedition drive" },
  { icon: Gamepad2Icon, label: "Sunny kingdom platformer" },
]

const models = ["Kimi K3", "Claude Opus 5.5", "Claude Sonnet 5.5"]

export function ChatComposer() {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <InputGroup>
        <InputGroupTextarea placeholder="Describe the game you want to build..." />
        <InputGroupAddon align="block-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<InputGroupButton variant="ghost" />}
            >
              <GripHorizontalIcon />
              Kimi K3
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-auto">
              {models.map((model) => (
                <DropdownMenuItem key={model}>{model}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <InputGroupButton
            variant="default"
            size="icon-sm"
            className="ml-auto rounded-full"
            aria-label="Send"
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map(({ icon: Icon, label }) => (
          <Button key={label} variant="outline" className="rounded-full">
            <Icon />
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}
