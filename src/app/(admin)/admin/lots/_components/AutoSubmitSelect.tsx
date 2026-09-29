'use client';

/**
 * A native <select> that submits its GET filter form as soon as it changes,
 * so list filters apply without a separate "Apply" click. Without JS it is a
 * plain select and the form's submit button still works.
 */
export function AutoSubmitSelect(props: React.ComponentProps<'select'>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
