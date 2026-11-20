The card grid needs a picture for every card it shows. Right now each card falls back to a grey box, which makes the page look broken in demos and hides how dense the grid really is. I can wire images in one of two ways, and they lead to different work later, so I'd like your call before I build either.

A) Fetch photos from a stock image API at build time. Each card gets a real, varied picture that matches its topic. It needs an API key stored in the deploy settings, a small cache so builds stay fast, and a credit line under each image to meet the licence. If the service is down, the build falls back to the grey box.

B) Ship a fixed list of twelve photos in the repo and pick one per card by a hash of its id. No key, no network, and builds never break, but pictures repeat on long pages and won't match the card's topic. Changing them later means a pull request.

I lean towards B for now and A once the design settles, but A is the one that changes what we promise in the licence notes. Which should I build?
