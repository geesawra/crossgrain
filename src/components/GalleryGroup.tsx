import { useMemo } from 'react';
import type { Photo, PhotoGroup } from '../lib/grain';
import Masonry from './Masonry';
import PhotoCard from './PhotoCard';

export default function GalleryGroup({ group, eagerIds, onOpen }: { group: PhotoGroup; eagerIds: ReadonlySet<string>; onOpen: (photo: Photo) => void }) {
  const items = useMemo(() => group.photos.map(photo => ({
    id: photo.id, content: <PhotoCard photo={photo} eager={eagerIds.has(photo.id)} onOpen={onOpen} />,
  })), [group, eagerIds, onOpen]);

  return <section className="gallery-group" aria-label={group.title || 'Gallery'}>
    {(group.title || group.description) && <div className="gallery-group-caption">
      {group.title && <p className="gallery-group-title">{group.title}</p>}
      {group.description && <p className="gallery-group-description">{group.description}</p>}
    </div>}
    <Masonry items={items} />
  </section>;
}
