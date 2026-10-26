// Longer reading content, so "time on this page" means something.
const ARTICLES = [
  {
    title: 'Why measure time on a page?',
    paragraphs: [
      'Page views tell you that someone opened a page, but not whether they read it. Time on page fills that gap: a visit of three seconds and a visit of three minutes are both one view, but they mean very different things.',
      'Measured well, it shows which content people actually spend time with, where they lose interest, and which pages they only pass through on the way somewhere else.',
    ],
  },
  {
    title: 'Measuring it honestly',
    paragraphs: [
      'The hard part is knowing when someone stops looking. A tab left open overnight is not eight hours of reading. That is why this app stops counting when the tab is hidden, when the connection drops, and when there has been no activity for a few minutes.',
      'The clock runs on the server. The browser only reports what happens (which page is open, whether the user is active), and the server decides how much time that adds up to. A user can\'t make their numbers bigger by changing code in their browser.',
    ],
  },
  {
    title: 'Live connections with WebSockets',
    paragraphs: [
      'A normal HTTP request is a question and an answer, then the connection is done. A WebSocket stays open, so the server knows the moment a tab is closed, and it can push new data to the browser without being asked.',
      'This app uses one WebSocket per tab. It carries the page changes from the browser to the server, and the live statistics from the server back to the browser, once a second.',
    ],
  },
  {
    title: 'Mobile first',
    paragraphs: [
      'More than half of web traffic comes from phones. Designing for the small screen first and then adding space for larger ones usually gives a cleaner result than squeezing a desktop layout onto a phone.',
      'Try this page on your phone, or in your browser\'s device mode: the navigation and the statistics table rearrange themselves to fit.',
    ],
  },
];

export default function Articles() {
  return (
    <div className="articles">
      {ARTICLES.map((article) => (
        <article key={article.title} className="card prose">
          <h2>{article.title}</h2>
          {article.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </article>
      ))}
    </div>
  );
}
