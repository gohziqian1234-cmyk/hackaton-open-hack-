import { Handshake } from 'lucide-react';
import { Empty, Button } from '../../components/ui';
// TODO(STUB): partner portal arrives in M7.
export default function Page() {
  return (
    <section className="wrap page-pad">
      <Empty
        heading="h1"
        title="For partners"
        icon={<Handshake size={26} />}
        action={<Button href="/drop">Go to the drop</Button>}
      >
        Coming in a later milestone. Brands and creator collectives will apply to launch a drop here.
      </Empty>
    </section>
  );
}
