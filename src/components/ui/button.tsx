"use client";

import * as React from "react"
import { Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, HTMLMotionProps } from "framer-motion"

const buttonVariants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    glass: "glass text-white hover:bg-white/10 hover:border-white/20 shadow-lg",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
}

const buttonSizes = {
    default: "h-11 px-6 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-14 rounded-xl px-10 text-lg",
    icon: "h-10 w-10",
}

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
    variant?: keyof typeof buttonVariants
    size?: keyof typeof buttonSizes
    isLoading?: boolean
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    children?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "default", isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
        return (
            <motion.button
                ref={ref}
                disabled={disabled || isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    buttonVariants[variant],
                    buttonSizes[size],
                    className
                )}
                {...props}
            >
                {isLoading && (
                    <svg
                        className="mr-2 h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                )}
                {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
                {children}
                {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
            </motion.button>
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
