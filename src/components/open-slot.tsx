'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { useLoop } from './provider';
import { Pending } from './shell';
import { Button, Empty } from './ui';
import { OpeningSequence } from './opening';
import { RevealExtras } from './purchase';
import { charOf } from './checkout';
import { themeFor } from '../lib/links';
import type { CharacterInfo, OrderItem } from '../lib/types';

/** /open/[accessId]: open a won slot. The server draws on the first tap; then the sequence plays. */
export function OpenSlot() {
  const { id } = useParams<{ id: string }>();
  const { data, act, login, busy } = useLoop();
  const [opened, setOpened] = useState<(OrderItem & { character: CharacterInfo }) | null>(null);
  if (!data) return <Pending />;
  if (!data.user)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="Sign in to open your box."
          icon={<PackageOpen size={26} />}
          action={
            data.demo ? (
              <Button disabled={busy} onClick={() => login('collector')}>
                Continue as the demo collector
              </Button>
            ) : (
              <Button href={'/login?next=' + encodeURIComponent('/open/' + id)}>Sign in</Button>
            )
          }
        >
          Slots belong to the collector who won them.
        </Empty>
      </section>
    );
  const slot = data.slots.find((s) => s.id === id);
  const item = opened ?? data.items.find((i) => i.access_id === id) ?? null;
  const campaignId = slot?.campaign_id ?? item?.campaign_id;
  if (!campaignId)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="This slot can’t be opened."
          icon={<PackageOpen size={26} />}
          action={<Button href="/drops">Explore the drops</Button>}
        >
          It may have expired after 15 minutes, been opened already, or belong to someone else.
        </Empty>
      </section>
    );
  const theme = themeFor(data.themes, campaignId);
  const capacity = theme?.capacity ?? data.campaign.capacity;
  const known = opened?.character ?? (item ? charOf(data, item.character_id) : undefined) ?? null;
  const requestDraw = async () => {
    const r = await act<OrderItem & { character: CharacterInfo }>({
      action: 'openSlot',
      accessId: id,
    });
    if (!r) return null;
    setOpened(r);
    return r.character;
  };
  const itemId = item?.id;
  const waiting = !item || item.state === 'opened';
  return (
    <section className="reveal-page">
      <OpeningSequence
        theme={theme}
        character={item ? known : null}
        capacity={capacity}
        requestDraw={requestDraw}
        startAt={item && !opened ? 'reveal' : 'box'}
        animateReveal={!item || !!opened}
        keepHref={
          waiting ? '/checkout' + (itemId ? '?select=' + itemId : '') : '/collection'
        }
        keepLabel={waiting ? 'Keep it — go to checkout' : 'See my collection'}
        tradeHref={waiting ? '/trades' + (itemId ? '?item=' + itemId : '') : undefined}
      >
        <RevealExtras
          data={data}
          theme={theme}
          characterId={known?.id ?? item?.character_id}
          excludeItem={itemId}
        />
      </OpeningSequence>
    </section>
  );
}
