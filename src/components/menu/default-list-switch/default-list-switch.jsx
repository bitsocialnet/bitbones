import styles from './default-list-switch.module.css';
import useDefaultList from '../../../hooks/use-default-list.js';
import { useDefaultCommunitiesState } from '../../../hooks/use-default-communities.js';
import icons from './icons.js';

// switches which client's default community list the feed is built from.
// both marks are always visible so it reads as a choice rather than a mystery button.
const DefaultListSwitch = ({ className }) => {
  const [defaultList, setDefaultList] = useDefaultList();
  const { communities, error } = useDefaultCommunitiesState();
  const next = defaultList === '5chan' ? 'seedit' : '5chan';

  const failed = !!error && communities.length === 0;
  const title = failed ? `${defaultList} default communities failed to load: ${error.message}` : `default communities: ${defaultList} (click for ${next})`;

  return (
    <button
      type='button'
      onClick={() => setDefaultList(next)}
      title={title}
      aria-label={`default communities: ${defaultList}, switch to ${next}`}
      className={[styles.defaultListSwitch, failed ? styles.failed : '', className].join(' ')}
    >
      {['5chan', 'seedit'].map((list) => (
        <img key={list} alt={list} src={icons[list]} width='12' height='12' className={[styles.icon, list === defaultList ? styles.active : styles.inactive].join(' ')} />
      ))}
    </button>
  );
};

export default DefaultListSwitch;
