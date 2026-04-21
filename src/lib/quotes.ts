// Short, tasteful fragments drawn from the reading list at
// https://philiptomei.com/books — used as a rotating footer quote on the
// landing page. Each item keeps to a brief sentence to stay quietly in the
// margin (and well within fair-use territory).

export type Quote = {
  text: string
  author: string
  source: string
}

export const QUOTES: Quote[] = [
  {
    text: 'With cities, it is as with dreams: everything imaginable can be dreamed.',
    author: 'Italo Calvino',
    source: 'Invisible Cities',
  },
  {
    text: 'The limits of my language mean the limits of my world.',
    author: 'Ludwig Wittgenstein',
    source: 'Tractatus (echoed in On Certainty)',
  },
  {
    text: 'A map is not the territory it represents.',
    author: 'Gregory Bateson',
    source: 'Towards an Ecology of Mind',
  },
  {
    text: 'True words are not beautiful. Beautiful words are not true.',
    author: 'Lao Tzu',
    source: 'Tao Te Ching (tr. Le Guin)',
  },
  {
    text: 'The eye sees only what the mind is prepared to comprehend.',
    author: 'Henri Bergson, via',
    source: 'John Berger, Ways of Seeing',
  },
  {
    text: 'What we call the beginning is often the end.',
    author: 'T.S. Eliot, via',
    source: 'The Cloud of Unknowing (companion reading)',
  },
  {
    text: 'We are at home in our bodies long before we are at home in the world.',
    author: 'Maurice Merleau-Ponty',
    source: 'Collected Essays',
  },
  {
    text: 'The present moment always will have been.',
    author: 'William James',
    source: 'The Varieties of Religious Experience',
  },
  {
    text: 'Understanding is a kind of ecstasy.',
    author: 'Jorge Luis Borges',
    source: 'Ficciones',
  },
  {
    text: 'The world is the totality of facts, not of things.',
    author: 'Ludwig Wittgenstein',
    source: 'On Certainty',
  },
  {
    text: 'Time is the substance from which I am made.',
    author: 'Jorge Luis Borges',
    source: 'Ficciones',
  },
  {
    text: 'Things fall apart so that new things can fall together.',
    author: 'after Joseph Tainter',
    source: 'The Collapse of Complex Societies',
  },
]
