"use client"

import { ChevronDownIcon, GripHorizontalIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroupButton } from "@/components/ui/input-group"
import {
  gameModelCatalog,
  type GameModelId,
  gameModelIds,
} from "@/lib/games/model-catalog"

export function ModelPicker({
  modelId,
  onModelChange,
}: {
  modelId: GameModelId
  onModelChange: (modelId: GameModelId) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<InputGroupButton variant="ghost" />}>
        <GripHorizontalIcon />
        {gameModelCatalog[modelId].name}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-auto">
        <DropdownMenuRadioGroup
          value={modelId}
          onValueChange={(value: GameModelId) => onModelChange(value)}
        >
          {gameModelIds.map((id) => (
            <DropdownMenuRadioItem key={id} value={id} closeOnClick>
              <div className="flex flex-col">
                <span>{gameModelCatalog[id].name}</span>
                <span className="text-xs text-muted-foreground">
                  {gameModelCatalog[id].tagline}
                </span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
