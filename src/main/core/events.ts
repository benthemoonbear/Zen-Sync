import { DEFAULT_PARTS } from './parts'
import type { Part } from './types'

export interface EventType {
  id: string
  name: string
  /** Default parts, in the order the day usually runs */
  parts: Part[]
  /** What photos from this kind of event look like, for detecting the event type automatically */
  prompts: string[]
}

const CORPORATE: Part[] = [
  { id: 'arrival', name: 'Arrival and registration', group: 'Arrival', prompts: [
    'a photo of people queuing at a registration desk at a conference',
    'a photo of delegates collecting name badges at a business event',
    'a photo of guests arriving in the foyer of a corporate venue'
  ] },
  { id: 'details', name: 'Venue and branding', floating: true, group: 'Arrival', prompts: [
    'a photo of a branded banner or pop-up stand at a corporate event',
    'a photo of an empty conference room with rows of chairs and a stage',
    'a close-up photo of name badges, lanyards and printed programmes'
  ] },
  { id: 'talks', name: 'Talks and presentations', group: 'Sessions', prompts: [
    'a photo of a speaker presenting on a stage in front of a projector screen',
    'a photo of a person speaking at a lectern with a microphone',
    'a photo of an audience seated in rows watching a presentation'
  ] },
  { id: 'panels', name: 'Panels and Q&A', group: 'Sessions', prompts: [
    'a photo of a panel discussion with several people seated on a stage',
    'a photo of an audience member asking a question with a microphone',
    'a photo of panellists on stools talking to an audience'
  ] },
  { id: 'workshops', name: 'Workshops and breakouts', group: 'Sessions', prompts: [
    'a photo of small groups working around tables at a workshop',
    'a photo of people writing on sticky notes and whiteboards in a meeting',
    'a photo of a trainer leading a small group session'
  ] },
  { id: 'networking', name: 'Networking', group: 'Networking', prompts: [
    'a candid photo of business people talking in small groups with coffee',
    'a photo of people shaking hands at a networking event',
    'a photo of delegates chatting at an exhibition stand'
  ] },
  { id: 'headshots', name: 'Headshots', floating: true, group: 'Networking', prompts: [
    'a professional headshot of a person in business clothes against a plain background',
    'a corporate portrait of a smiling person looking at the camera'
  ] },
  { id: 'awards', name: 'Awards', group: 'Evening', prompts: [
    'a photo of a person receiving an award trophy on stage',
    'a photo of award winners posing with a certificate and a presenter'
  ] },
  { id: 'dinner', name: 'Dinner', group: 'Evening', prompts: [
    'a photo of guests seated at round tables at a corporate dinner',
    'a photo of a gala dinner room with place settings and lighting'
  ] },
  { id: 'entertainment', name: 'Entertainment and party', group: 'Evening', prompts: [
    'a photo of guests dancing at an evening corporate party',
    'a photo of a band or DJ performing at a business event at night'
  ] }
]

const PARTY: Part[] = [
  { id: 'arrival', name: 'Arrival', prompts: [
    'a photo of guests arriving at a birthday party',
    'a photo of people greeting each other with hugs at a party'
  ] },
  { id: 'details', name: 'Decorations and details', floating: true, prompts: [
    'a photo of balloons and party decorations',
    'a close-up photo of a decorated party table with food',
    'a photo of a birthday sign or banner'
  ] },
  { id: 'mingling', name: 'Guests and mingling', prompts: [
    'a candid photo of party guests chatting and laughing with drinks',
    'a photo of friends posing together at a party'
  ] },
  { id: 'games', name: 'Games and activities', prompts: [
    'a photo of people playing party games',
    'a photo of children playing at a birthday party'
  ] },
  { id: 'cake', name: 'Cake and candles', prompts: [
    'a photo of a person blowing out candles on a birthday cake',
    'a photo of guests singing around a birthday cake'
  ] },
  { id: 'speeches', name: 'Speeches and toasts', prompts: [
    'a photo of a person giving a toast with a raised glass at a party',
    'a photo of someone making a speech at a birthday party'
  ] },
  { id: 'dancing', name: 'Dancing', prompts: [
    'a photo of people dancing at a party at night',
    'a photo of a dance floor with coloured lights'
  ] }
]

const CHRISTENING: Part[] = [
  { id: 'getting-ready', name: 'Getting ready', prompts: [
    'a photo of a baby being dressed in a white christening gown',
    'a photo of a family getting ready at home before a christening'
  ] },
  { id: 'details', name: 'Details', floating: true, prompts: [
    'a close-up photo of a christening gown, shoes or candle',
    'a close-up photo of a baby\'s hands or feet'
  ] },
  { id: 'arrival', name: 'Arrival at church', prompts: [
    'a photo of a family arriving outside a church with a baby',
    'a photo of guests gathering outside a church'
  ] },
  { id: 'ceremony', name: 'Ceremony', prompts: [
    'a photo of a priest pouring water over a baby at a baptismal font',
    'a photo of godparents holding a baby during a christening service',
    'a photo of a family standing at the front of a church during a ceremony'
  ] },
  { id: 'groups', name: 'Family groups', prompts: [
    'a posed group photo of a family with a baby outside a church',
    'a photo of godparents and parents posing with a baby'
  ] },
  { id: 'celebration', name: 'Celebration', prompts: [
    'a photo of guests eating and chatting at a christening party',
    'a photo of a christening cake',
    'a photo of relatives holding a baby at a party'
  ] }
]

const ENGAGEMENT: Part[] = [
  { id: 'arrival', name: 'Getting started', prompts: [
    'a candid photo of a couple chatting before a photoshoot',
    'a photo of a couple walking together in casual clothes'
  ] },
  { id: 'details', name: 'Ring and details', floating: true, prompts: [
    'a close-up photo of an engagement ring on a hand',
    'a close-up photo of a couple holding hands'
  ] },
  { id: 'walking', name: 'Walking and candids', prompts: [
    'a candid photo of a couple walking hand in hand outdoors',
    'a photo of a couple laughing together in a park or street'
  ] },
  { id: 'portraits', name: 'Posed portraits', prompts: [
    'a posed portrait of a couple looking at the camera',
    'a close romantic portrait of a couple embracing'
  ] },
  { id: 'golden-hour', name: 'Golden hour', prompts: [
    'a photo of a couple in warm golden sunset light',
    'a silhouette of a couple against the setting sun'
  ] }
]

export const EVENT_TYPES: EventType[] = [
  { id: 'wedding', name: 'Wedding', parts: DEFAULT_PARTS, prompts: [
    'a photo from a wedding day', 'a photo of a bride and groom at their wedding', 'a photo of wedding guests in formal clothes'
  ] },
  { id: 'corporate', name: 'Corporate event', parts: CORPORATE, prompts: [
    'a photo from a corporate conference', 'a photo of business people at a work event', 'a photo of a speaker at a business event'
  ] },
  { id: 'party', name: 'Party or birthday', parts: PARTY, prompts: [
    'a photo from a birthday party', 'a photo of friends celebrating at a party', 'a photo of party decorations and balloons'
  ] },
  { id: 'christening', name: 'Christening', parts: CHRISTENING, prompts: [
    'a photo from a christening', 'a photo of a baby being baptised in a church', 'a photo of a family with a baby in white'
  ] },
  { id: 'engagement', name: 'Engagement shoot', parts: ENGAGEMENT, prompts: [
    'a photo from a couple engagement photoshoot', 'a romantic portrait of a couple outdoors', 'a photo of a couple in casual clothes posing'
  ] }
]

export const DEFAULT_EVENT = 'wedding'

export function eventById(id: string): EventType {
  return EVENT_TYPES.find((e) => e.id === id) ?? EVENT_TYPES[0]
}

/** What photos from a custom event type look like, described from its name. */
export function eventPromptsFor(name: string): string[] {
  const n = name.trim().toLowerCase() || 'event'
  return [`a photo from a ${n}`, `a photo taken at a ${n}`]
}

/** Prompts for a part; a part the user added (no prompts) is described from its name. */
export function promptsFor(part: Part): string[] {
  if (part.prompts.length) return part.prompts
  const name = part.name.trim().toLowerCase()
  if (!name) return ['a photo at an event']
  return [`a photo of ${name}`, `a photo of ${name} at an event`]
}

/** Parts ready for sorting: every part has at least one prompt. */
export function partsForSort(parts: Part[]): Part[] {
  return parts.map((p) => (p.prompts.length ? p : { ...p, prompts: promptsFor(p) }))
}
