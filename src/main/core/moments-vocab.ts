/**
 * Moments Zen Sync can recognise and name when they aren't on the parts list. Each is matched as
 * "a photo of <moment>". Kept to moments with a distinct look; ordinary ones (guests chatting) would match too much.
 */
export const MOMENT_VOCAB: string[] = [
  // wedding traditions
  'First look', 'Bouquet toss', 'Garter toss', 'Sparkler exit', 'Confetti run', 'Ring exchange', 'First kiss',
  'Handfasting', 'Jumping the broom', 'Breaking the glass', 'Tea ceremony', 'Hora', 'Money dance', 'Cake smash',
  'Father-daughter dance', 'Mother-son dance', 'Grand entrance', 'Bridesmaids getting ready', 'Groomsmen getting ready',
  'Signing the register', 'Rose ceremony', 'Unity candle', 'Sand ceremony', 'Mehndi', 'Haldi', 'Baraat', 'Sangeet',
  'Henna', 'Lasso ceremony', 'Ceilidh', 'Bagpiper', 'Horse and carriage', 'Wedding car', 'Vintage bus',
  // entertainment and activities
  'Fireworks', 'Sparklers', 'Photo booth', 'Magician', 'Live band', 'DJ set', 'Silent disco', 'Karaoke', 'Choir',
  'String quartet', 'Harpist', 'Fire dancer', 'Drag performance', 'Caricature artist', 'Lawn games', 'Bouncy castle',
  'Face painting', 'Balloon artist', 'Casino tables', 'Bucking bronco', 'Hot air balloon', 'Drone light show',
  'Confetti cannon', 'Smoke bombs', 'Bonfire', 'Fire pit', 'Ice sculpture', 'Champagne tower', 'Chocolate fountain',
  // food and drink
  'Pizza van', 'Food truck', 'Hog roast', 'Barbecue', 'Afternoon tea', 'Dessert table', 'Cocktail bar', 'Oyster bar',
  'Cheese tower', 'Late night snacks', 'Coffee van', 'Ice cream van',
  // portraits and places
  'Golden hour portraits', 'Night portraits', 'Rain portraits', 'Beach portraits', 'Woodland portraits',
  'Rooftop portraits', 'Pet portraits', 'Dog of honour', 'Children playing', 'Flower girls', 'Page boys',
  // corporate and other events
  'Product launch', 'Award presentation', 'Keynote speech', 'Panel discussion', 'Networking drinks', 'Exhibition stands',
  'Team building', 'Workshop', 'Ribbon cutting', 'Gala dinner', 'Charity auction', 'Fashion show', 'Catwalk',
  'Book signing', 'Q&A session', 'Group photo', 'Headshots', 'Behind the scenes', 'Stage setup', 'Sound check',
  // celebrations
  'Blowing out candles', 'Opening presents', 'Piñata', 'Baby shower games', 'Gender reveal', 'Christening cake',
  'Graduation caps', 'Prom arrival', 'Dance performance', 'Speeches and toasts', 'Toast with champagne', 'Surprise reveal'
]
