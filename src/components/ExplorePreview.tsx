import { IMG } from "../lib/images";
import { useReveal } from "../hooks/useReveal";
import { Img } from "./Img";
import { Icon, type IconName } from "./Icon";
import type { PlannerMode } from "../types";

type Idea = { title: string; tag: string; image: string; prompt: string; icon: IconName; mode?: PlannerMode; tone?: "date" };

const ESCAPES: Idea[] = [
  {
    title: "Go nearby", tag: "A day out · back tonight", image: IMG.skandagiri, prompt: "I want a nearby day escape", icon: "car", mode: "nearby",
  },
  {
    title: "Go somewhere", tag: "Longer escape · plan ahead", image: IMG.gokarna, prompt: "I want a longer trip", icon: "calendar", mode: "long_trip",
  },
];

const CITY_GROUPS: { heading: string; note: string; cards: Idea[] }[] = [
  {
    heading: "Your kind of day",
    note: "Start with the feeling you want to follow.",
    cards: [
  { title: "Need a reset", tag: "Sunday · slow · solo", image: IMG.reset, prompt: "I need a slow reset day, solo", icon: "leaf" },
  { title: "Want something new", tag: "High novelty · half day", image: IMG.adventureQuest, prompt: "Show me something new I've never done, half day", icon: "sparkles" },
  { title: "Good food only", tag: "Eat your way through", image: IMG.food, prompt: "A food-only day", icon: "food" },
  { title: "Market crawl", tag: "Stalls · snacks · local flavour", image: IMG.market, prompt: "A local market crawl with street food and independent shops", icon: "bag" },
    ],
  },
  {
    heading: "When you've got company",
    note: "Plans that feel right with the people you brought along.",
    cards: [
  { title: "Date Night", tag: "Flowers · shared plates · city lights", image: IMG.dateQuest, prompt: "Plan a thoughtful romantic date with flowers, a beautiful walk, intimate food, and an evening place with warm city lights", icon: "heart", tone: "date" },
  { title: "Bring the gang", tag: "Friends · full day", image: IMG.gang, prompt: "A full day out with friends", icon: "users" },
  { title: "Tourist in your own city", tag: "See it fresh", image: IMG.cityQuest, prompt: "My friend is visiting for the first time, one day", icon: "camera" },
    ],
  },
  {
    heading: "Make a date of it",
    note: "Culture, collections and things worth leaving the house for.",
    cards: [
  { title: "Art run", tag: "Galleries · studios · design", image: IMG.artQuest, prompt: "An art run with galleries, studios and design stops", icon: "palette" },
  { title: "Museum day", tag: "History · collections · culture", image: IMG.museumQuest, prompt: "A museum day with real collections and a good lunch", icon: "camera" },
  { title: "Catch an event", tag: "Live · current · local", image: IMG.eventQuest, prompt: "Find a real event happening locally and build my plan around it", icon: "music" },
    ],
  },
];

export function ExplorePreview({ onPick }: { onPick: (prompt: string, mode?: PlannerMode) => void }) {
  const intro = useReveal();
  return (
    <section className="explore" id="explore">
      <div className="container">
        <header className={`explore__intro ${intro.className}`} ref={intro.ref}>
          <p className="label explore__eyebrow">Ideas to steal</p>
          <h2 className="display explore__lead">
            Not sure yet? Start from a feeling.
          </h2>
          <p className="explore__lede">
            Tap any of these and we&rsquo;ll turn it into a real, mapped plan you
            can tweak &mdash; whoever you&rsquo;re with, however long you&rsquo;ve got.
          </p>
        </header>

        <div className="escape-grid">
          {ESCAPES.map((idea) => (
            <button
              key={idea.title}
              className="discover-card discover-card--featured"
              onClick={() => onPick(idea.prompt, idea.mode)}
            >
              <Img src={idea.image} alt={idea.title} className="discover-card__img" />
              <span className="discover-card__scrim" />
              <span className="discover-card__icon"><Icon name={idea.icon} size={18} /></span>
              <span className="discover-card__body">
                <b>{idea.title}</b>
                <span>{idea.tag}</span>
              </span>
              <span className="discover-card__go">Build this <Icon name="arrow" size={14} /></span>
            </button>
          ))}
        </div>
        <section className="city-quests" aria-labelledby="city-quests-title">
          <header className="city-quests__head">
            <div>
              <p className="label">City quest</p>
              <h3 id="city-quests-title">Find a new side of your city.</h3>
            </div>
            <span>Pick a starting point</span>
          </header>
          {CITY_GROUPS.map((group) => (
            <div className="city-quests__row" key={group.heading}>
              <div className="city-quests__row-head">
                <h4>{group.heading}</h4>
                <p>{group.note}</p>
              </div>
              <div className={`city-quests__grid city-quests__grid--${group.cards.length}`}>
                {group.cards.map((idea) => (
                  <button key={idea.title} className={`discover-card${idea.tone ? ` discover-card--${idea.tone}` : ""}`} onClick={() => onPick(idea.prompt, idea.mode)}>
                    <Img src={idea.image} alt={idea.title} className="discover-card__img" />
                    <span className="discover-card__scrim" />
                    <span className="discover-card__icon"><Icon name={idea.icon} size={18} /></span>
                    <span className="discover-card__body"><b>{idea.title}</b><span>{idea.tag}</span></span>
                    <span className="discover-card__go">Build this <Icon name="arrow" size={14} /></span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}
