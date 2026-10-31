'use client';
import { useState } from 'react';
import { ImageIcon, MapPin, Check, Clock3 } from 'lucide-react';
import type { Work, ProjectMedia } from '@/lib/model';
export type MapPreview = { id: string; url: string; attribution: string };
export function AssetVisual({
  id,
  title,
  work,
  preview,
  media,
}: {
  id: string;
  title: string;
  work: Work | null;
  preview: MapPreview | null;
  media?: ProjectMedia[];
}) {
  const photo = (media ?? work?.media)?.find((m) => m.kind === 'photo');
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null),
    photoKey = `${id}:${photo?.url ?? ''}`;
  const original = photo && failedPhoto !== photoKey;
  const image = original ? photo.url : preview?.id === id ? preview.url : null;
  return (
    <figure
      data-card-section="hero"
      className="asset-visual"
      data-image-basis={original ? 'source_photo' : image ? 'map_context' : 'pending'}
    >
      {image ? (
        <img
          key={image}
          src={image}
          alt={
            original
              ? photo.caption
              : `Map context around ${title}; not a verified asset photograph`
          }
          onError={() => {
            if (original) setFailedPhoto(photoKey);
          }}
        />
      ) : (
        <div className="asset-visual-placeholder">
          <ImageIcon size={25} />
          <span>
            {(preview?.id === id && !preview.url) || (work && !work.location)
              ? 'Location preview unavailable'
              : 'Preparing the location view'}
          </span>
        </div>
      )}
      <span className="asset-visual-label">
        <MapPin size={11} />
        {original ? 'Source photograph' : 'Map context'}
      </span>
      <figcaption>
        {original ? (
          <a href={photo.receipt.url} target="_blank" rel="noopener noreferrer">
            {photo.caption} · source photograph
          </a>
        ) : work?.demo ? (
          'Showcase map context · Not a site photograph or evidence of the invented project.'
        ) : (
          <>
            {image
              ? 'Context only · building identity unverified'
              : 'A coordinate highlights the location, not an inferred building.'}
          </>
        )}
      </figcaption>
      {!original && image && (
        <div className="asset-image-attribution">
          <a
            href="https://www.mapbox.com/about/maps/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Mapbox"
            className="mapboxgl-ctrl-logo"
          />
          <span>{preview?.attribution}</span>
        </div>
      )}
    </figure>
  );
}
export function AssetEvidenceSummary({
  hasLocation,
  hasPayments,
}: {
  hasLocation: boolean;
  hasPayments: boolean;
}) {
  return (
    <section
      data-card-section="evidence"
      className="asset-evidence-summary"
      aria-label="Evidence summary"
    >
      <h3>Evidence</h3>
      <div>
        <span>
          <MapPin size={15} />
          {hasLocation ? 'Source location recorded' : 'Location not established'}
        </span>
        {hasLocation ? <Check size={15} className="evidence-present" /> : <Clock3 size={15} />}
      </div>
      <div>
        <span>
          <ImageIcon size={15} />
          {hasPayments ? 'Payment records linked' : 'Financial records not linked'}
        </span>
        {hasPayments ? <Check size={15} className="evidence-present" /> : <Clock3 size={15} />}
      </div>
    </section>
  );
}
