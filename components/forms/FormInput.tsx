import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { colors } from '@/lib/design-tokens'
import { cn } from '@/lib/utils'

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: React.ReactNode
  error?: string
  helperText?: string
}

/**
 * FormInput: wrapper consolidado para inputs de formulário
 * Reduz duplicação de estilo label + input + error message
 */
export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, icon, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div>
        {label && (
          <Label
            htmlFor={inputId}
            className="mb-2 block text-sm font-semibold"
            style={{ color: colors.text }}
          >
            {label}
          </Label>
        )}
        <div className="relative">
          {icon && (
            <div
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: colors.textSecondary }}
              aria-hidden="true"
            >
              {icon}
            </div>
          )}
          <Input
            ref={ref}
            id={inputId}
            className={cn(
              'h-12 rounded-2xl border-l transition-all duration-300',
              icon && 'pl-10',
              error && 'border-red-500 focus-visible:ring-red-500/10',
              className
            )}
            style={{
              borderColor: error ? '#DC2626' : colors.border,
              color: colors.text,
            }}
            onFocus={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = colors.primary
              }
            }}
            onBlur={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = colors.border
              }
            }}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-xs font-medium" style={{ color: '#DC2626' }}>
            {error}
          </p>
        )}
        {helperText && (
          <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

FormInput.displayName = 'FormInput'

export default FormInput
