import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onChange: (open: boolean) => void;
  children: React.ReactNode;
  isClickOutsideEnabled?: boolean;
}
export function Modal({
  isOpen,
  onChange,
  children,
  description = '',
  title,
  isClickOutsideEnabled = false,
}: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onChange}>
      <DialogContent
        aria-describedby={title}
        onInteractOutside={(e) => {
          if (!isClickOutsideEnabled) {
            e.preventDefault();
          }
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
