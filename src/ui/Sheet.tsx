import { Dialog, type DialogProps } from './Dialog'

/** Bottom sheet on phones (thumb reach), centred card from md up. Same a11y as Dialog. */
export function Sheet(props: Omit<DialogProps, 'variant'>) {
  return <Dialog {...props} variant="sheet" />
}
