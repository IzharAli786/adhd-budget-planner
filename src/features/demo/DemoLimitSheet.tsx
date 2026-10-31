import { Link } from 'react-router'
import { DEMO_CAP } from '../../db/demo'
import { etsyUrl } from '../../lib/demo'
import { buttonClass } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'

/**
 * Shown when the 25th entry is used up. Calm on purpose: nothing was lost, nothing is
 * locked, and the only ask is a link. The entry that hit the cap was not saved.
 */
export function DemoLimitSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Demo limit reached — the full app has no limits"
      description={`The demo holds ${DEMO_CAP} entries, so that last one wasn’t added. Everything else is still here to look around.`}
      actions={
        <>
          <Link
            to="/more/bring"
            onClick={onClose}
            className={buttonClass('secondary', 'md', false)}
          >
            Bring my setup across
          </Link>
          <a href={etsyUrl()} target="_blank" rel="noopener" className={buttonClass()}>
            Get the full app on Etsy
            <Icon name="external" size={16} />
          </a>
        </>
      }
    />
  )
}
