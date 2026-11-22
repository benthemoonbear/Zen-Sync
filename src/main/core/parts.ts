import type { Part } from './types'

/** Default parts of a UK wedding day, in order. Prompts are short captions SigLIP compares photos against. */
export const DEFAULT_PARTS: Part[] = [
  { id: 'getting-ready', name: 'Getting ready', group: 'Morning', prompts: [
    'a photo of a bride having her make-up done',
    'a photo of a bride having her hair styled',
    'a photo of a groom fastening his cufflinks or tie',
    'a photo of bridesmaids getting ready in a hotel room',
    'a photo of a bride putting on her wedding dress'
  ] },
  { id: 'details', name: 'Details', floating: true, group: 'Morning', prompts: [
    'a close-up photo of wedding rings',
    'a close-up photo of wedding shoes and a dress hanging',
    'a close-up photo of a bridal bouquet of flowers',
    'a close-up photo of wedding invitations and stationery',
    'a close-up photo of a buttonhole flower on a suit'
  ] },
  { id: 'arrival', name: 'Arrival and guests', group: 'Ceremony', prompts: [
    'a photo of wedding guests arriving outside a venue',
    'a photo of guests in suits and dresses greeting each other',
    'a photo of a groom and best man waiting outside',
    'a photo of guests taking their seats before a wedding ceremony'
  ] },
  { id: 'ceremony', name: 'Ceremony', group: 'Ceremony', prompts: [
    'a photo of a bride walking down the aisle',
    'a photo of a couple saying their wedding vows in front of a registrar',
    'a photo of a couple exchanging wedding rings',
    'a photo of a couple kissing at the end of their wedding ceremony',
    'a photo of seated guests watching a wedding ceremony'
  ] },
  { id: 'signing', name: 'Signing', group: 'Ceremony', prompts: [
    'a photo of a couple signing the wedding register at a table',
    'a photo of a bride holding a pen over a marriage certificate',
    'a photo of witnesses signing the register beside the couple'
  ] },
  { id: 'confetti', name: 'Confetti', group: 'Ceremony', prompts: [
    'a photo of guests throwing confetti over a couple',
    'a photo of a bride and groom walking through falling confetti',
    'a photo of petals in the air above newlyweds'
  ] },
  { id: 'drinks', name: 'Drinks reception', group: 'Reception', prompts: [
    'a photo of wedding guests chatting with glasses of champagne',
    'a candid photo of guests mingling at a drinks reception',
    'a photo of waiters serving canapes to wedding guests'
  ] },
  { id: 'groups', name: 'Groups and family', group: 'Reception', prompts: [
    'a posed group photo of a wedding party with family',
    'a formal group photo of guests standing around a bride and groom',
    'a posed photo of a couple with their parents',
    'a group photo of bridesmaids and groomsmen'
  ] },
  { id: 'portraits', name: 'Couple portraits', group: 'Reception', prompts: [
    'a romantic portrait of a bride and groom alone outdoors',
    'a portrait photo of a bride on her own in a garden',
    'a photo of a newly married couple walking hand in hand',
    'a close portrait of a bride and groom laughing together'
  ] },
  { id: 'venue', name: 'Venue and breakfast setup', group: 'Reception', prompts: [
    'a photo of an empty wedding reception room with decorated tables',
    'a photo of a wedding table setting with place cards and flowers',
    'a photo of a wedding venue interior before guests arrive'
  ] },
  { id: 'breakfast', name: 'Wedding breakfast', group: 'Reception', prompts: [
    'a photo of wedding guests seated at tables eating dinner',
    'a photo of a top table with the bride and groom eating',
    'a photo of guests raising glasses at a wedding dinner'
  ] },
  { id: 'speeches', name: 'Speeches', group: 'Reception', prompts: [
    'a photo of a man giving a speech at a wedding holding a microphone',
    'a photo of a father of the bride reading a speech',
    'a photo of guests laughing during wedding speeches'
  ] },
  { id: 'cake', name: 'Cake cutting', group: 'Reception', prompts: [
    'a photo of a bride and groom cutting their wedding cake',
    'a photo of a tiered wedding cake',
    'a photo of a couple holding a knife over a cake'
  ] },
  { id: 'first-dance', name: 'First dance', group: 'Evening', prompts: [
    'a photo of a bride and groom having their first dance',
    'a photo of a couple dancing alone on a dance floor surrounded by guests',
    'a photo of newlyweds slow dancing under lights'
  ] },
  { id: 'evening', name: 'Evening party', group: 'Evening', prompts: [
    'a photo of wedding guests dancing at a party at night',
    'a photo of a crowded dance floor with disco lights',
    'a photo of a live band playing at a wedding evening party'
  ] }
]
