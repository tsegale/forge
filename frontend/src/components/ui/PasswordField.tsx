import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { Field } from './Field'

/**
 * A password input with a show/hide toggle (fewer typos on a phone), and a Caps Lock warning,
 * which is the usual reason a correct password is refused.
 */
export function PasswordField({ hint, ...props }: Omit<ComponentProps<typeof Field>, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const readCaps = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState('CapsLock'))
  }
  return (
    <Field
      {...props}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      spellCheck={false}
      onKeyDown={readCaps}
      onKeyUp={readCaps}
      hint={capsLock ? <span className="font-medium text-warning-ink">Caps Lock is on.</span> : hint}
      trailing={
        <button
          type="button"
          aria-pressed={visible}
          aria-label="Show password"
          title={visible ? 'Hide password' : 'Show password'}
          onClick={() => {
            setVisible((value) => !value)
          }}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Eye aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      }
    />
  )
}
