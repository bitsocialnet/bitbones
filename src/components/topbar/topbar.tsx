import { useState, type ChangeEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import AccountMenu from '../menu/account-menu';
import Submit from '../menu/submit';
import GoToCommunityModal from '../menu/go-to-community-modal';
import useTimeFilter from '../../hooks/use-time-filter';
import useVerbose from '../../hooks/use-verbose';
import styles from './topbar.module.css';

// routes that are not feeds, the sort and time controls don't apply to them
const pages = new Set(['profile', 'settings', 'communities', 'about', 'inbox', 'u', 'stats', 'log']);

const sortTypes = [
  { value: 'hot', label: 'hot' },
  { value: 'new', label: 'new' },
  { value: 'topAll', label: 'top' },
  { value: 'active', label: 'active' },
  { value: 'controversialAll', label: 'controversial' },
];

const createFeedLink = (feedName?: string, sortType?: string, timeFilterName?: string) => {
  let feedLink = '';
  if (feedName && feedName !== 'all') {
    feedLink = `/p/${feedName}`;
  }
  if (sortType) {
    feedLink += `/${sortType}`;
  }
  if (timeFilterName) {
    if (!sortType) {
      feedLink += '/hot';
    }
    feedLink += `/${timeFilterName}`;
  }
  return feedLink || '/';
};

const createCatalogLink = (feedName?: string, sortType?: string, timeFilterName?: string) => {
  let catalogLink = '/catalog';
  if (feedName && feedName !== 'all') {
    catalogLink = `/p/${feedName}/catalog`;
  }
  if (sortType) {
    catalogLink += `/${sortType}`;
  }
  if (timeFilterName) {
    if (!sortType) {
      catalogLink += '/hot';
    }
    catalogLink += `/${timeFilterName}`;
  }
  return catalogLink;
};

interface NavItemProps {
  to: string;
  current: boolean;
  children: string;
}

const NavItem = ({ to, current, children }: NavItemProps) => (
  <Link to={to} className={[styles.item, current ? styles.current : undefined].join(' ')} aria-current={current ? 'page' : undefined}>
    {children}
  </Link>
);

const Topbar = () => {
  const { timeFilterNames } = useTimeFilter();
  const [verbose, setVerbose] = useVerbose();
  const [goToCommunityModalIsOpen, setGoToCommunityModalIsOpen] = useState(false);
  const navigate = useNavigate();
  const params = useParams<{ commentCid?: string; sortType?: string; timeFilterName?: string }>();
  const { pathname } = useLocation();
  const pathNames = pathname.split('/');

  const isPost = pathNames[1] === 'p' && !!params.commentCid;
  const isPage = pages.has(pathNames[1]) || isPost;
  const isCatalog = pathNames[1] === 'catalog' || pathNames[3] === 'catalog';
  // p/<address> on community and post pages, p/subscriptions on the subscriptions feed
  const feedName = pathNames[1] === 'p' ? pathNames[2] : undefined;
  const isCommunity = !!feedName && feedName !== 'subscriptions';
  const sortType = params.sortType || (isCatalog ? 'active' : 'hot');
  const createLink = isCatalog ? createCatalogLink : createFeedLink;

  const changeTimeFilter = (event: ChangeEvent<HTMLSelectElement>) => navigate(createLink(feedName, params.sortType, event.target.value));

  return (
    <header className={styles.topbar}>
      <Link to='/' className={styles.brand}>
        bitbones
      </Link>

      <nav className={styles.group} aria-label='feeds'>
        <NavItem to={createLink(undefined, params.sortType, params.timeFilterName)} current={!feedName && !isPage}>
          p/all
        </NavItem>
        <NavItem to={createLink('subscriptions', params.sortType, params.timeFilterName)} current={feedName === 'subscriptions'}>
          p/subs
        </NavItem>
        {isCommunity && (
          <NavItem to={`/p/${feedName}`} current={!isPost}>
            {`p/${feedName}`}
          </NavItem>
        )}
        <button type='button' className={styles.item} onClick={() => setGoToCommunityModalIsOpen(true)} title='go to a community by address'>
          p/…
        </button>
      </nav>

      {!isPage && (
        <nav className={styles.group} aria-label='sort'>
          {sortTypes.map(({ value, label }) => (
            <NavItem key={value} to={createLink(feedName, value, params.timeFilterName)} current={value === sortType}>
              {label}
            </NavItem>
          ))}
          <select aria-label='time filter' className={styles.select} onChange={changeTimeFilter} value={params.timeFilterName || timeFilterNames[0]}>
            {timeFilterNames.map((timeFilterName, i) => (
              <option key={timeFilterName + i} value={timeFilterName}>
                {timeFilterName}
              </option>
            ))}
          </select>
        </nav>
      )}

      <nav className={styles.group} aria-label='views'>
        <NavItem to={createFeedLink(feedName, params.sortType, params.timeFilterName)} current={!isPage && !isCatalog}>
          feed
        </NavItem>
        <NavItem to={createCatalogLink(feedName, params.sortType, params.timeFilterName)} current={isCatalog}>
          catalog
        </NavItem>
        <NavItem to='/stats' current={pathNames[1] === 'stats'}>
          stats
        </NavItem>
        <NavItem to='/log' current={pathNames[1] === 'log'}>
          log
        </NavItem>
      </nav>

      <span className={styles.spacer} />

      <label className={styles.item} title='print the protocol data behind each row'>
        <input type='checkbox' className={styles.checkbox} checked={verbose} onChange={(event) => setVerbose(event.target.checked)} />
        verbose
      </label>
      <Submit className={styles.item} />
      <AccountMenu className={[styles.item, styles.account].join(' ')} />

      <GoToCommunityModal isOpen={goToCommunityModalIsOpen} setIsOpen={setGoToCommunityModalIsOpen} />
    </header>
  );
};

export default Topbar;
