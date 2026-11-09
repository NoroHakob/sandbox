"use client"

import { useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { deleteGame, renameGame } from "@/lib/games/actions"
import { MAX_TITLE_LENGTH } from "@/lib/games/limits"

const UNEXPECTED_ERROR = "Something went wrong. Try again."

// The menu and its dialogs for one game, shared by the game header and the
// sidebar. The menu renders the trigger element, with the icon inside
export function GameActionsMenu({
  gameId,
  title,
  trigger,
}: {
  gameId: string
  title: string
  trigger: React.ReactElement
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={trigger}
          aria-label={`Options for ${title}`}
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog
        gameId={gameId}
        title={title}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <DeleteDialog
        gameId={gameId}
        title={title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

function RenameDialog({
  gameId,
  title,
  open,
  onOpenChange,
}: {
  gameId: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState(title)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    if (isPending) return
    // Start from the current title each time
    if (next) {
      setValue(title)
      setError(null)
    }
    onOpenChange(next)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return setError("Enter a name.")
    if (trimmed === title) return onOpenChange(false)

    startTransition(async () => {
      try {
        const { error } = await renameGame(gameId, trimmed)
        if (error) return setError(error)
        onOpenChange(false)
      } catch {
        setError(UNEXPECTED_ERROR)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rename game</DialogTitle>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="game-title">Name</FieldLabel>
            <Input
              id="game-title"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
              maxLength={MAX_TITLE_LENGTH}
              aria-invalid={error ? true : undefined}
              disabled={isPending}
              autoFocus
              required
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" />}
              disabled={isPending}
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isPending || !value.trim()}>
              {isPending && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  gameId,
  title,
  open,
  onOpenChange,
}: {
  gameId: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const pathname = usePathname()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (next) setError(null)
    onOpenChange(next)
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        // Leave the page only when it shows the game being deleted. On
        // success the action redirects home or refreshes in place
        const { error } = await deleteGame(gameId, {
          redirectHome: pathname === `/games/${gameId}`,
        })
        if (error) return setError(error)
        onOpenChange(false)
      } catch {
        setError(UNEXPECTED_ERROR)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move this game to trash?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{title}&rdquo;, its chat and its files will be permanently
            deleted. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending && <Spinner />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
