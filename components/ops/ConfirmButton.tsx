"use client";

/**
 * A submit button that makes you say yes first. Used for the two actions that
 * cannot be undone from here: refunding money, and cancelling a confirmed call.
 */
export default function ConfirmButton({
  children,
  message,
  className,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
