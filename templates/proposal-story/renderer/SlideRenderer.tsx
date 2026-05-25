type Detail = {
  point: string;
  description: string;
};

type ContentItem = {
  title: string;
  summary: string;
  details?: Detail[];
};

type SlideContent = {
  title_box?: { text: string };
  message_box?: { text: string };
  lead_box?: { text: string };
  body_box?: { items?: ContentItem[] };
  evidence_box?: { sources?: string[] };
  note_box?: { text: string };
};

type SlideJson = {
  slide_no: number;
  layout_id: string;
  slide_role: string;
  main_message: string;
  content: SlideContent;
};

function TextBlock({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="text-block">
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  );
}

function StandardTableSlide({ slide }: { slide: SlideJson }) {
  const items = slide.content.body_box?.items || [];
  return (
    <article className="slide slide-standard-table">
      <h1>{slide.content.title_box?.text || slide.main_message}</h1>
      <p className="message">{slide.content.message_box?.text || slide.main_message}</p>
      <table>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <th>{item.title}</th>
              <td>{item.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function CardsSlide({ slide }: { slide: SlideJson }) {
  const items = slide.content.body_box?.items || [];
  return (
    <article className="slide slide-cards">
      <h1>{slide.content.title_box?.text || slide.main_message}</h1>
      <p className="message">{slide.content.message_box?.text || slide.main_message}</p>
      <div className="cards">
        {items.map((item, index) => (
          <section className="card" key={index}>
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
            <ul>
              {(item.details || []).map((detail, detailIndex) => (
                <li key={detailIndex}>
                  <strong>{detail.point}</strong>
                  <span>{detail.description}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

function ChapterOverviewSlide({ slide }: { slide: SlideJson }) {
  return (
    <article className="slide slide-chapter-overview">
      <h1>{slide.content.title_box?.text || slide.main_message}</h1>
      <TextBlock title="この章で伝えること">
        <p>{slide.content.message_box?.text || slide.main_message}</p>
      </TextBlock>
      <CardsSlide slide={slide} />
    </article>
  );
}

function ComparisonSlide({ slide }: { slide: SlideJson }) {
  return <CardsSlide slide={slide} />;
}

function EvidenceTableSlide({ slide }: { slide: SlideJson }) {
  return <StandardTableSlide slide={slide} />;
}

export function SlideRenderer({ slide }: { slide: SlideJson }) {
  switch (slide.layout_id) {
    case "chapter_overview":
      return <ChapterOverviewSlide slide={slide} />;
    case "cards_2":
    case "cards_3":
    case "cards_4":
    case "cards_5":
    case "problem_cards_3":
    case "solution_cards_3":
      return <CardsSlide slide={slide} />;
    case "comparison_2":
    case "comparison_3":
    case "before_after":
    case "as_is_to_be":
      return <ComparisonSlide slide={slide} />;
    case "evidence_table":
    case "score_table":
    case "standard_table":
      return <EvidenceTableSlide slide={slide} />;
    default:
      return <StandardTableSlide slide={slide} />;
  }
}
