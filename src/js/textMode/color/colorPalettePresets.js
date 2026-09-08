var ColorPalettePresets = [
  {
    category: "2 Color",
    colorPalettes: [
      {
        "name": "Commodore PET", "id": "commodorepet"
      },
      { "name": "Terminal", "id": "terminalbw", 
        "options": [
          { "name": "Black and White", "id": "terminalbw"},
          { "name": "Black and Green", "id": "terminalbg"},
          { "name": "Black and Orange", "id": "terminalbo"}

        ]
      },
    ]
  },
  {
    category: "4 Color",
    colorPalettes: [
      { "name": "Gameboy", "id": "gameboy",
        "options": [
          { "name": "Original", "id": "gameboy" },
          { "name": "Pocket", "id": "gameboypocketa" },
          { "name": "Printer", "id": "gameboyprinter" }

        ]
      },
      { "name": "CGA Palette", "id": "cga0_hi",
        "options": [
          { "name": "Palette 0 (High)", "id": "cga0_hi"},
          { "name": "Palette 1 (High)", "id": "cga1_hi"},
          { "name": "Palette 2 (High)", "id": "cga2_hi"}
        ]
      }
    ]

  },
  {
    category: "8 Color",
    colorPalettes: [
      { "name": "Teletext", "id": "teletext", "description": "3-bit RGB Palette" },
      { "name": "Sharp MZ-700", "id": "sharpmz700" },
    ]
  },
  {
    category: "10 Color",
    colorPalettes: [
      { "name": "LTRO-1", "id": "ltro-1", "author": "skeddles" }
    ]
  },

  {
    category: "12 Color",
    colorPalettes: [
      { "name": "Japanese Woodblock", "id": "japanesewoodblock", "author": "Polyducks" }
    ]
  },

  {
    category: "16 Color",
    colorPalettes: [
      { "name": "ANSI VGA", "id": "ansi" },
      { "name": "Apple II", "id": "appleII", "description": "The Apple II series features a 16-color composite video palette, based on the YIQ color space used by the NTSC color TV system. Colors 5 and 10 (gray) are indistinguishable on original hardware" },
      { "name": "Commodore 64", "id": "c64_colodore",
        "options": [
          { "name": "Colodore", "id": "c64_colodore" },
          { "name": "Pepto", "id": "c64_pepto" },
          { "name": "VICE", "id": "c64_vice" }
        ]
      },
      { "name": "Commodore VIC 20", "id": "vic20" },
      { "name": "IBM CGA", "id": "cga" },
      { "name": "PICO-8", "id": "pico8" },
      { "name": "ZX Spectrum", "id": "spectrum" }
    ]
  },
  {
    // http://www.cpcwiki.eu/index.php/Video_modes
    category: "27 Color",
    colorPalettes: [
      { "name": "Amstrad CPC", "id": "amstradcpc", "description": "The 3-level (not bits) RGB uses three level for every red, green and blue color components, resulting in a 33 = 27 colors palette." }
    ]
  },
  {
    category: "52 Color",
    colorPalettes: [
      { "name": "NES", "id": "nes" }
    ]

  },

  {
    category: "64 Color",
    colorPalettes: [
      { "name": "Sega Master System", "id": "sms" },
      { "name": "IBM EGA", "id": "ega" }
    ]

  },
  {
    category: "128 Color",
    colorPalettes: [
      { "name": "Atari 2600", "id": "atari2600_ntsc",
        "options": [
          { "name": "Atari 2600 NTSC", "id": "atari2600_ntsc" },
          { "name": "Atari 2600 PAL", "id": "atari2600_pal" }
        ]
      },
      /*
      { "name": "Atari 400 / 800", "id": "atari400" },
      */

      { "name": "Commodore 16 / Plus 4", "id": "commodore16" }
    ]

  },
  {
    category: "256 Color",
    colorPalettes: [
      { "name": "VGA Default", "id": "vga" }
      /*
      ,
      { "name": "Deluxe Paint", "id": "deluxepaint" }
      */
    ]
  }
];