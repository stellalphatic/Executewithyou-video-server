'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'signal' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = "relative inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none tracking-wide active:scale-[0.98]";

  const variants = {
    primary: "bg-content-high text-app-bg hover:opacity-90 border border-transparent",
    secondary: "bg-transparent border border-app-border text-content-high hover:border-content-medium hover:bg-app-surface",
    signal: "bg-rose-600 text-white hover:bg-rose-700 border border-transparent",
    ghost: "bg-transparent text-content-medium hover:text-content-high",
    danger: "bg-red-500 text-white hover:bg-red-600 border border-transparent"
  };

  const sizes = {
    sm: "h-8 text-xs px-3 rounded-sm",
    md: "h-10 text-sm px-5 rounded-sm",
    lg: "h-12 text-sm px-8 rounded-sm", // Technical look often uses smaller text in larger buttons
    icon: "h-9 w-9 p-0 rounded-sm"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin text-current" />}
      {!isLoading && icon && <span className={`${children ? 'mr-2' : ''}`}>{icon}</span>}
      {children}
    </button>
  );
};