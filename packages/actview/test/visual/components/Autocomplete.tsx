export const data = [
  'Alfalfa Sprouts',
  'Apple',
  'Apricot',
  'Artichoke',
  'Asian Pear',
  'Asparagus',
  'Atemoya',
  'Avocado',
  'Bamboo Shoots',
  'Banana',
  'Bean Sprouts',
  'Beans',
  'Beets',
  'Belgian Endive',
  'Bell Peppers',
  'Bitter Melon',
  'Blackberries',
  'Blueberries',
  'Bok Choy',
  'Boniato',
  'Boysenberries',
  'Broccoflower',
  'Broccoli',
  'Brussels Sprouts',
  'Cabbage',
  'Cactus Pear',
  'Cantaloupe',
  'Carambola',
  'Carrots',
  'Casaba Melon',
  'Cauliflower',
  'Celery',
  'Chayote',
  'Cherimoya',
  'Cherries',
  'Coconuts',
  'Collard Greens',
  'Corn',
  'Cranberries',
  'Cucumber',
  'Dates',
  'Dried Plums',
  'Eggplant',
  'Endive',
  'Escarole',
  'Feijoa',
  'Fennel',
  'Figs',
  'Garlic',
  'Gooseberries',
  'Grapefruit',
  'Grapes',
  'Green Beans',
  'Green Onions',
  'Greens',
  'Guava',
  'Hominy',
  'Honeydew Melon',
  'Horned Melon',
  'Iceberg Lettuce',
  'Jerusalem Artichoke',
  'Jicama',
  'Kale',
  'Kiwifruit',
  'Kohlrabi',
  'Kumquat',
  'Leeks',
  'Lemons',
  'Lettuce',
  'Lima Beans',
  'Limes',
  'Longan',
  'Loquat',
  'Lychee',
  'Madarins',
  'Malanga',
  'Mandarin Oranges',
  'Mangos',
  'Mulberries',
  'Mushrooms',
  'Napa',
  'Nectarines',
  'Okra',
  'Onion',
  'Oranges',
  'Papayas',
  'Parsnip',
  'Passion Fruit',
  'Peaches',
  'Pears',
  'Peas',
  'Peppers',
  'Persimmons',
  'Pineapple',
  'Plantains',
  'Plums',
  'Pomegranate',
  'Potatoes',
  'Prickly Pear',
  'Prunes',
  'Pummelo',
  'Pumpkin',
  'Quince',
  'Radicchio',
  'Radishes',
  'Raisins',
  'Raspberries',
  'Red Cabbage',
  'Rhubarb',
  'Romaine Lettuce',
  'Rutabaga',
  'Shallots',
  'Snow Peas',
  'Spinach',
  'Sprouts',
  'Squash',
  'Strawberries',
  'String Beans',
  'Sweet Potato',
  'Tangelo',
  'Tangerines',
  'Tomatillo',
  'Tomato',
  'Turnip',
  'Ugli Fruit',
  'Water Chestnuts',
  'Watercress',
  'Watermelon',
  'Waxed Beans',
  'Yams',
  'Yellow Squash',
  'Yuca/Cassava',
  'Zucchini Squash',
];

interface ItemProps {
  children?: any;
  active: boolean;
}

const Item = defineComponent(function (props: ItemProps & any) {
  return () => (
    <div
      ref={props.ref}
      tabIndex={-1}
      className={`p-2 cursor-default${props.active ? ' bg-blue-500 text-white' : ''}`}
      {...props}
    >
      {props.children}
    </div>
  );
});

export const Main = defineComponent(function () {
  const open = ref(false);
  const inputValue = ref('');
  const activeIndex = ref<number | null>(null);

  const listRef = ref<Array<HTMLElement | null>>([]);

  const {floatingStyles, context, refs} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
    middleware: [
      offset(5),
      flip({padding: 10}),
      size({
        apply({rects, availableHeight, elements}) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            maxHeight: `${availableHeight}px`,
          });
        },
        padding: 10,
      }),
    ],
  });

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    useRole(context, {role: 'combobox'}),
    useDismiss(context),
    useListNavigation(context, {
      listRef,
      activeIndex,
      onNavigate: (i) => {
        activeIndex.value = i;
      },
      virtual: true,
      loop: true,
      allowEscape: true,
    }),
  ]);

  function onChange(event: any) {
    const value = event.target.value;
    inputValue.value = value;

    if (value) {
      open.value = true;
    } else {
      open.value = false;
    }
  }

  return () => {
    const items = data.filter((item) =>
      item.toLowerCase().startsWith(inputValue.value.toLowerCase()),
    );

    return (
      <>
        <h1 className="text-5xl font-bold mb-8">Autocomplete</h1>
        <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
          <input
            ref={refs.setReference}
            value={inputValue.value}
            className="border-2 p-2 rounded border-slate-300 focus:border-blue-500 outline-none"
            placeholder="Enter fruit"
            aria-autocomplete="list"
            {...getReferenceProps({
              onChange,
              onKeyDown(event: any) {
                if (
                  event.key === 'Enter' &&
                  activeIndex.value != null &&
                  items[activeIndex.value]
                ) {
                  inputValue.value = items[activeIndex.value];
                  activeIndex.value = null;
                  open.value = false;
                }
              },
            })}
          />
          <FloatingPortal>
            {open.value && (
              <FloatingFocusManager
                context={context}
                initialFocus={-1}
                visuallyHiddenDismiss
              >
                <div
                  ref={refs.setFloating}
                  className="bg-slate-100 rounded overflow-y-auto"
                  style={floatingStyles}
                  {...getFloatingProps()}
                >
                  {items.map((item, index) => (
                    <Item
                      key={item}
                      active={activeIndex.value === index}
                      {...getItemProps({
                        active: activeIndex.value === index,
                        ref(node: any) {
                          listRef.value[index] = node;
                        },
                        onClick() {
                          inputValue.value = item;
                          open.value = false;
                          refs.domReference.value?.focus?.();
                        },
                      })}
                    >
                      {item}
                    </Item>
                  ))}
                </div>
              </FloatingFocusManager>
            )}
          </FloatingPortal>
        </div>
      </>
    );
  };
});
