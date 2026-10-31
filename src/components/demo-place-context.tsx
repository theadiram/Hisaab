const photos = [
  {
    url: '/images/demo/lalbagh-glasshouse-2013.jpg',
    title: 'Lalbagh Glasshouse',
    author: 'Subhashish Panigrahi',
    date: '6 November 2013',
    source: 'https://commons.wikimedia.org/wiki/File:Lalbagh_glass_house,_Bangalore.jpg',
  },
  {
    url: '/images/demo/lalbagh-flower-show-2012.jpg',
    title: 'Lalbagh flower show',
    author: 'Rameshng',
    date: '26 January 2012',
    source:
      'https://commons.wikimedia.org/wiki/File:Lalbagh_glass_house_during_flower_show_Jan_2012_1444.jpg',
  },
];

export function DemoPlaceContext() {
  return (
    <section
      className="demo-place-context"
      data-card-section="hero"
      aria-label="Real photographs of the mapped place"
    >
      <div className="demo-place-heading">
        <span>THE REAL PLACE</span>
        <h3>Lalbagh, through the lens</h3>
        <p>
          Historical photographs of this location. These show the place, not the fictional project
          or its completion.
        </p>
      </div>
      <div className="demo-place-facts">
        <strong>Lalbagh Botanical Garden · Bengaluru, Karnataka</strong>
        <p>
          A botanical garden with a landmark Glasshouse. The photographs and mapped place are real;
          the sample contract, payments and recipient below are not verified records of work here.
        </p>
        <a
          href="https://karnatakatourism.org/en/attractions/lalbagh-botanical-garden/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Official place information · Karnataka Tourism ↗
        </a>
      </div>
      <div className="demo-place-gallery">
        {photos.map((photo) => (
          <figure key={photo.url}>
            <a href={photo.source} target="_blank" rel="noopener noreferrer">
              <img src={photo.url} alt={photo.title + ' in Bengaluru'} loading="lazy" />
            </a>
            <figcaption>
              <strong>{photo.title}</strong>
              <span>
                {photo.date} · {photo.author}
              </span>
              <span>
                <a href={photo.source} target="_blank" rel="noopener noreferrer">
                  Original photograph
                </a>{' '}
                ·{' '}
                <a
                  href="https://creativecommons.org/licenses/by-sa/3.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CC BY-SA 3.0
                </a>
              </span>
              <small>Display cropped; original unchanged.</small>
            </figcaption>
          </figure>
        ))}
      </div>
      <aside className="demo-risk-context">
        <span>GENERAL ACCOUNTABILITY CHECK</span>
        <h4>Where corruption risks can arise</h4>
        <p>
          Inflated estimates, restricted bidding, false measurements and payments for unfinished
          work are risks to examine through records and site checks.
        </p>
        <strong>
          No corruption finding is made about Lalbagh or any person. This project's financial
          records and recipient are fictional.
        </strong>
      </aside>
    </section>
  );
}
