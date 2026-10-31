import { PageHeader } from '../../ui/PageHeader'
import { ImpulseList } from './ImpulseList'

/** More > 48-hour list, for Simple mode (Full mode shows the same list in Goals). */
export function ImpulseScreen() {
  return (
    <>
      <PageHeader
        title="48-hour list"
        subtitle="A pause between wanting and buying."
        back={{ to: '/more', label: 'More' }}
      />
      <ImpulseList />
    </>
  )
}
