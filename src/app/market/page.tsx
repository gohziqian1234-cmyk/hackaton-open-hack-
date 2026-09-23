import { Store } from 'lucide-react';
import { Empty, Button } from '../../components/ui';
// TODO(STUB): creator marketplace arrives in M8.
export default function Page() {
  return (
    <section className="wrap page-pad">
      <Empty
        heading="h1"
        title="Marketplace"
        icon={<Store size={26} />}
        action={<Button href="/drop">Go to the drop</Button>}
      >
        Coming in a later milestone. Creators will list their own blind-box series here.
      </Empty>
    </section>
  );
}
