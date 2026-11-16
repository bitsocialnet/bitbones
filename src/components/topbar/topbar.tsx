import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import AccountMenu from '../menu/account-menu';
import Submit from '../menu/submit';
import GoToCommunityModal from '../menu/go-to-community-modal';
import useTimeFilter from '../../hooks/use-time-filter';
import useVerbose from '../../hooks/use-verbose';
import useMediaExpanded from '../../hooks/use-media-expanded';
import useHeightVariable from '../../hooks/use-height-variable';
import { feedSortTypes } from '../../lib/utils';
import styles from './topbar.module.css';

// routes that are not feeds, the sort and time controls don't apply to them
const pages = new Set(['profile', 'settings', 'communities', 'about', 'inbox', 'author', 'stats', 'log']);

// post links of these views (/modal/<address>/comment/<cid>) set the communityAddress param
const experimentalViews = new Set(['modal', 'css-switch']);

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
    feedLink = `/${feedName}`;
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
    catalogLink = `/${feedName}/catalog`;
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
  const { expanded: mediaExpanded, setExpanded: setMediaExpanded } = useMediaExpanded();
  const [goToCommunityModalIsOpen, setGoToCommunityModalIsOpen] = useState(false);
  const topbarRef = useRef<HTMLElement>(null);
  useHeightVariable(topbarRef, '--topbar-height');
  const navigate = useNavigate();
  const params = useParams<{ communityAddress?: string; commentCid?: string; sortType?: string; timeFilterName?: string }>();
  const { pathname } = useLocation();
  const pathNames = pathname.split('/');

  // the experimental views carry a community address in their post links without being that community's page
  const communityAddress = experimentalViews.has(pathNames[1]) ? undefined : params.communityAddress;
  const isPost = !!communityAddress && !!params.commentCid;
  // community settings (/<address>/settings) is a page of that community, not one of its feeds
  const isCommunitySettings = !!communityAddress && pathNames[2] === 'settings';
  const isPage = pages.has(pathNames[1]) || isPost || isCommunitySettings;
  const isCatalog = pathNames[1] === 'catalog' || pathNames[2] === 'catalog';
  // the address on community and post pages, 'subscriptions' on the subscriptions feed
  const feedName = pathNames[1] === 'subscriptions' ? 'subscriptions' : communityAddress;
  const isCommunity = !!communityAddress;
  // the home feed has its sort type as a literal first segment (/hot), every other feed as a route param
  const sortTypeParam = params.sortType || (feedSortTypes.includes(pathNames[1]) ? pathNames[1] : undefined);
  const sortType = sortTypeParam || (isCatalog ? 'active' : 'hot');
  const createLink = isCatalog ? createCatalogLink : createFeedLink;

  const changeTimeFilter = (event: ChangeEvent<HTMLSelectElement>) => navigate(createLink(feedName, sortTypeParam, event.target.value));

  return (
    <header className={styles.topbar} ref={topbarRef}>
      <Link to='/' className={styles.brand}>
        bitbones
      </Link>

      <nav className={styles.group} aria-label='feeds'>
        <NavItem to={createLink(undefined, sortTypeParam, params.timeFilterName)} current={!feedName && !isPage}>
          all
        </NavItem>
        <NavItem to={createLink('subscriptions', sortTypeParam, params.timeFilterName)} current={feedName === 'subscriptions'}>
          subs
        </NavItem>
        {isCommunity && (
          <NavItem to={`/${communityAddress}`} current={!isPost}>
            {communityAddress}
          </NavItem>
        )}
        <button type='button' className={styles.item} onClick={() => setGoToCommunityModalIsOpen(true)} title='go to a community by address'>
          go to…
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
        <NavItem to={createFeedLink(feedName, sortTypeParam, params.timeFilterName)} current={!isPage && !isCatalog}>
          feed
        </NavItem>
        <NavItem to={createCatalogLink(feedName, sortTypeParam, params.timeFilterName)} current={isCatalog}>
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
      <label className={styles.item} title='expand or collapse all images, videos and embeds, and keep that for new ones'>
        <input type='checkbox' className={styles.checkbox} checked={mediaExpanded} onChange={(event) => setMediaExpanded(event.target.checked)} />
        expand media
      </label>
      <Submit className={styles.item} />
      <AccountMenu className={[styles.item, styles.account].join(' ')} />

      <GoToCommunityModal isOpen={goToCommunityModalIsOpen} setIsOpen={setGoToCommunityModalIsOpen} />
    </header>
  );
};

export default Topbar;
