// Full starter menu transcribed from Malik Taste Point's printed menu.
// Each product gets a themed icon-card image automatically (see emojiImage in lib.js)
// unless you later paste a real photo link in Menu & Prices > Edit > Image link.
// A few prices that were unclear/cut off in the photo are marked "estimated: true" below
// (Water Bottle, Cold Drink 345ml, Half Chargha, Flavour Pasta) - double check these after import.

export const CATEGORY_EMOJI = {
  'Deals': '🎉', 'Starters & Fries': '🍟', 'Malik Signature': '⭐', 'Burgers': '🍔', 'Broast': '🍗',
  'Chicken Rolls': '🌯', 'Beef Rolls': '🌯', 'Sandwiches': '🥪', 'BBQ - Tikka & Boti': '🍖',
  'BBQ - Kabab': '🍢', 'Pizza': '🍕', 'Pasta & Paratha': '🍝', 'Chicken Karahi': '🥘',
  'Beef Karahi': '🥘', 'Handi': '🍲', 'Chargha': '🍗', 'Sides & Drinks': '🥤', 'Packets & Bread': '🍞'
};

// Old items that should be removed when the menu is imported/updated.
export const REMOVE_NAMES = ['Cold Drink (345ml)'];

const PIZZA_SIZES = [{ name: 'Small', priceDelta: 0 }, { name: 'Medium', priceDelta: 350 }, { name: 'Large', priceDelta: 750 }];

export const MENU_SEED = [
  // ───── Deals (combo price, description lists what's included) ─────
  { cat: 'Deals', name: 'Deal 1', price: 1050, description: 'Leg Tikka 1, Chicken Roll 1, Paratha 2, Small Pizza 1, 345ml Drink' },
  { cat: 'Deals', name: 'Deal 2', price: 1200, description: 'Tikka Chest 1, Paratha 3, Malai Roll 1, Zinger Burger 1, 345ml Drink' },
  { cat: 'Deals', name: 'Deal 3', price: 1000, description: '4 Malai Roll, 1 Liter Drink' },
  { cat: 'Deals', name: 'Deal 4', price: 1650, description: 'Rashmi Kabab Full, Poori Paratha 3, Chicken Roll 1, Zinger Burger 1, Club Sandwich 1, 1 Liter Cold Drink' },
  { cat: 'Deals', name: 'Deal 5', price: 1750, description: 'Chest Broast 1, Zinger Burger 2, Chicken Wings 6pcs, Cold Drink 1 Liter' },
  { cat: 'Deals', name: 'Deal 6', price: 1650, description: 'Pizza Medium 1, Pasta 1, Pizza Fries 1, 1 Liter Drink' },
  { cat: 'Deals', name: 'Deal 7', price: 600, description: 'Chicken Burger 2, 345ml Drink' },
  { cat: 'Deals', name: 'Deal 8', price: 850, description: 'Zinger Burger 1, BBQ Club Sandwich 1, 345ml Drink' },
  { cat: 'Deals', name: 'Deal 9', price: 1050, description: 'Chicken Roll 3, Mayo Roll 1, Crispy Roll 1, 1 Liter Cold Drink' },
  { cat: 'Deals', name: 'Deal 10', price: 2000, description: 'Large Pizza 1, Pizza Fries 1, Pasta, 1 Liter Cold Drink' },
  { cat: 'Deals', name: 'Special Deal', price: 1900, description: 'Malai Boti Half, Chicken Boti Half, Tikka Leg, Beef Kabab Half, Rashmi Kabab Half, Beef Bihari Boti Half, 3 Paratha Small, 3 Chapati, 1.5 Liter Cold Drink' },

  // ───── Starters & Fries ─────
  { cat: 'Starters & Fries', name: 'Masala Fries', price: 100 },
  { cat: 'Starters & Fries', name: 'Mayo Fries', price: 150 },
  { cat: 'Starters & Fries', name: 'Loaded Fries', price: 300 },
  { cat: 'Starters & Fries', name: 'Crispy Fries', price: 250 },
  { cat: 'Starters & Fries', name: 'Chicken Strips', price: 350 },
  { cat: 'Starters & Fries', name: 'Pizza Fries', price: 380 },
  { cat: 'Starters & Fries', name: 'Hot Shot Pizza Fries', price: 300 },
  { cat: 'Starters & Fries', name: 'Cheesy Fries', price: 200 },

  // ───── Malik Signature ─────
  { cat: 'Malik Signature', name: 'Smash Burger', price: 500, featured: true },
  { cat: 'Malik Signature', name: 'Sizzling Malai Boti', price: 800, featured: true },
  { cat: 'Malik Signature', name: 'Lava Burger', price: 600, featured: true },
  { cat: 'Malik Signature', name: 'Special Shahi Tikka Boneless', price: 550, featured: true },
  { cat: 'Malik Signature', name: 'Peri Peri Bites (6 pcs)', price: 500, featured: true },

  // ───── Burgers ─────
  { cat: 'Burgers', name: 'Zinger Burger', price: 400 },
  { cat: 'Burgers', name: 'Jumbo Zinger Burger', price: 550 },
  { cat: 'Burgers', name: 'Zinger Cheese Burger', price: 470 },
  { cat: 'Burgers', name: 'Chicken Patty Burger', price: 300 },
  { cat: 'Burgers', name: 'Chicken Cheese Patty Burger', price: 350 },
  { cat: 'Burgers', name: 'Beef Burger', price: 350 },
  { cat: 'Burgers', name: 'Beef Burger with Cheese', price: 400 },

  // ───── Broast ─────
  { cat: 'Broast', name: 'Chicken Wings (6 pcs)', price: 400 },
  { cat: 'Broast', name: 'Leg Broast', price: 400 },
  { cat: 'Broast', name: 'Drum Stick (6 pcs)', price: 600 },
  { cat: 'Broast', name: 'Chest Broast', price: 450 },
  { cat: 'Broast', name: 'Masala Broast', price: 400 },
  { cat: 'Broast', name: 'Cheese Broast', price: 530 },
  { cat: 'Broast', name: 'Leg Cheese', price: 450 },
  { cat: 'Broast', name: 'Nuggets (6 pcs)', price: 400 },

  // ───── Chicken Rolls ─────
  { cat: 'Chicken Rolls', name: 'Crispy Roll', price: 220 },
  { cat: 'Chicken Rolls', name: 'Zinger Roll', price: 280 },
  { cat: 'Chicken Rolls', name: 'Chicken Roll', price: 170 },
  { cat: 'Chicken Rolls', name: 'Mayo Roll', price: 190 },
  { cat: 'Chicken Rolls', name: 'Malai Boti Roll', price: 220 },
  { cat: 'Chicken Rolls', name: 'Kabab Roll', price: 160 },
  { cat: 'Chicken Rolls', name: 'Shapatey Roll', price: 600 },
  { cat: 'Chicken Rolls', name: 'Chicken Cheese Roll', price: 230 },
  { cat: 'Chicken Rolls', name: 'Malai Boti Cheese Roll', price: 260 },
  { cat: 'Chicken Rolls', name: 'Fries Roll', price: 120 },

  // ───── Beef Rolls ─────
  { cat: 'Beef Rolls', name: 'Beef Kabab Roll', price: 180 },
  { cat: 'Beef Rolls', name: 'Beef Mayo Roll', price: 200 },
  { cat: 'Beef Rolls', name: 'Beef Kabab with Cheese', price: 230 },
  { cat: 'Beef Rolls', name: 'Beef Boti Roll', price: 180 },
  { cat: 'Beef Rolls', name: 'Beef Boti Mayo Roll', price: 200 },
  { cat: 'Beef Rolls', name: 'Beef Boti Cheese Roll', price: 230 },

  // ───── Sandwiches ─────
  { cat: 'Sandwiches', name: 'BBQ Club Sandwich', price: 400 },
  { cat: 'Sandwiches', name: 'Malai Boti Club Sandwich', price: 420 },
  { cat: 'Sandwiches', name: 'Crispy Club Sandwich', price: 450 },
  { cat: 'Sandwiches', name: 'Cheesy Club Sandwich', price: 480 },
  { cat: 'Sandwiches', name: 'Vegetable Club Sandwich', price: 250 },
  { cat: 'Sandwiches', name: 'Kabab Sandwich', price: 380 },

  // ───── BBQ - Tikka & Boti ─────
  { cat: 'BBQ - Tikka & Boti', name: 'Namkeen Tikka Leg', price: 380 },
  { cat: 'BBQ - Tikka & Boti', name: 'Chest Tikka', price: 400 },
  { cat: 'BBQ - Tikka & Boti', name: 'Leg Tikka', price: 370 },
  { cat: 'BBQ - Tikka & Boti', name: 'Malai Tikka', price: 450 },
  { cat: 'BBQ - Tikka & Boti', name: 'Chicken Boti', price: 400 },
  { cat: 'BBQ - Tikka & Boti', name: 'Malai Boti', price: 450 },
  { cat: 'BBQ - Tikka & Boti', name: 'Behari Boti Beef', price: 550 },
  { cat: 'BBQ - Tikka & Boti', name: 'Behari Tikka Double (6 pcs)', price: 750 },
  { cat: 'BBQ - Tikka & Boti', name: 'Behari Tikka Single (3 pcs)', price: 400 },
  { cat: 'BBQ - Tikka & Boti', name: 'Leg Tikka with Cheese', price: 420 },

  // ───── BBQ - Kabab ─────
  { cat: 'BBQ - Kabab', name: 'Rashmi Kabab', price: 400 },
  { cat: 'BBQ - Kabab', name: 'Beef Behari Kabab', price: 500 },
  { cat: 'BBQ - Kabab', name: 'Gola Kabab', price: 480 },
  { cat: 'BBQ - Kabab', name: 'Beef Seekh Kabab', price: 480 },
  { cat: 'BBQ - Kabab', name: 'Chicken Cheese Kabab', price: 500 },
  { cat: 'BBQ - Kabab', name: 'Beef Cheese Kabab', price: 550 },
  { cat: 'BBQ - Kabab', name: 'Chandan Kabab', price: 500 },

  // ───── Pizza (price = Small; variants add Medium/Large) ─────
  { cat: 'Pizza', name: 'Pizza - Malai Boti', price: 400, variants: PIZZA_SIZES },
  { cat: 'Pizza', name: 'Pizza - Tikka', price: 400, variants: PIZZA_SIZES },
  { cat: 'Pizza', name: 'Pizza - Fajita', price: 400, variants: PIZZA_SIZES },
  { cat: 'Pizza', name: 'Pizza - Afghani', price: 400, variants: PIZZA_SIZES },
  { cat: 'Pizza', name: 'Pizza - Super Supreme', price: 400, variants: PIZZA_SIZES },
  { cat: 'Pizza', name: 'Pizza - Creamy', price: 400, variants: PIZZA_SIZES },
  { cat: 'Pizza', name: 'Pizza - Tandoori', price: 400, variants: PIZZA_SIZES },
  { cat: 'Pizza', name: 'Royal Crown Pizza', price: 800, variants: [{ name: 'Medium', priceDelta: 0 }, { name: 'Large', priceDelta: 400 }] },
  { cat: 'Pizza', name: 'Special Lava Pizza', price: 650 },

  // ───── Pasta & Paratha ─────
  { cat: 'Pasta & Paratha', name: 'Lasagna', price: 500 },
  { cat: 'Pasta & Paratha', name: 'Pasta', price: 400 },
  { cat: 'Pasta & Paratha', name: 'Pasta - Chicken Cheese', price: 400, estimated: true },
  { cat: 'Pasta & Paratha', name: 'Pasta - Creamy', price: 400, estimated: true },
  { cat: 'Pasta & Paratha', name: 'Pasta - Tikka', price: 400, estimated: true },
  { cat: 'Pasta & Paratha', name: 'Pizza Paratha', price: 400 },
  { cat: 'Pasta & Paratha', name: 'Cheese Paratha', price: 250 },

  // ───── Chicken Karahi (Mustard Oil) - Pao/Half/Full ─────
  { cat: 'Chicken Karahi', name: 'Chicken Red Karahi', price: 500, variants: [{ name: 'Pao', priceDelta: 0 }, { name: 'Half', priceDelta: 450 }, { name: 'Full', priceDelta: 1350 }] },
  { cat: 'Chicken Karahi', name: 'White Karahi', price: 550, variants: [{ name: 'Pao', priceDelta: 0 }, { name: 'Half', priceDelta: 500 }, { name: 'Full', priceDelta: 1550 }] },
  { cat: 'Chicken Karahi', name: 'Makhni Karahi', price: 550, variants: [{ name: 'Pao', priceDelta: 0 }, { name: 'Half', priceDelta: 500 }, { name: 'Full', priceDelta: 1650 }] },

  // ───── Beef Karahi - Half/Full ─────
  { cat: 'Beef Karahi', name: 'Beef Karahi', price: 1200, variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 1200 }] },
  { cat: 'Beef Karahi', name: 'Beef Makhni Karahi', price: 1300, variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 1200 }] },
  { cat: 'Beef Karahi', name: 'Beef Creamy Karahi', price: 1400, variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 1300 }] },

  // ───── Handi - Half/Full ─────
  { cat: 'Handi', name: 'Chicken Handi', price: 1300, variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 1200 }] },
  { cat: 'Handi', name: 'Makhni Handi', price: 1400, variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 1200 }] },
  { cat: 'Handi', name: 'Cheese Handi', price: 1500, variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 1300 }] },

  // ───── Chargha ─────
  { cat: 'Chargha', name: 'Malik Special Chargha', price: 1000, variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 800 }] },

  // ───── Sides & Drinks ─────
  { cat: 'Sides & Drinks', name: 'Bara Paratha', price: 100 },
  { cat: 'Sides & Drinks', name: 'Paratha', price: 50 },
  { cat: 'Sides & Drinks', name: 'Chapati', price: 20 },
  { cat: 'Sides & Drinks', name: 'Raita', price: 50 },
  { cat: 'Sides & Drinks', name: 'Chutni', price: 50 },
  // sync:true = if the item already exists, its price/sizes are updated too
  { cat: 'Sides & Drinks', name: 'Cold Drink', price: 100, sync: true, variants: [{ name: '300 ml', priceDelta: 0 }, { name: '500 ml', priceDelta: 20 }, { name: '1 Ltr', priceDelta: 80 }, { name: '1.5 Ltr', priceDelta: 120 }, { name: 'Jumbo', priceDelta: 170 }] },
  { cat: 'Sides & Drinks', name: 'Sting', price: 100, sync: true, variants: [{ name: '300 ml', priceDelta: 0 }, { name: '500 ml', priceDelta: 40 }] },
  { cat: 'Sides & Drinks', name: 'Water Bottle', price: 50, sync: true, variants: [{ name: 'Small', priceDelta: 0 }, { name: 'Large', priceDelta: 40 }] },

  // ───── Packets & Bread ─────
  { cat: 'Packets & Bread', name: 'Burger Bun Packet', price: 180, sync: true },
  { cat: 'Packets & Bread', name: 'Hot Dog Packet', price: 50, sync: true },
  { cat: 'Packets & Bread', name: 'Bread Jumbo', price: 400, sync: true }
];
