import { Navigate, Route, Routes, Outlet, useLocation, useParams } from 'react-router-dom';
import Home from './views/home';
import HomeModal from './views/home-modal';
import HomeCssSwitch from './views/home-css-switch';
import Subscriptions from './views/subscriptions';
import SubscriptionsCatalog from './views/subscriptions-catalog';
import TextOnly from './views/text-only';
import Catalog from './views/catalog';
import Board from './views/board';
import Settings from './views/settings';
import Community from './views/community';
import CommunityCatalog from './views/community-catalog';
import Post from './views/post';
import PendingPost from './views/pending-post';
import NotFound from './views/not-found';
import Profile from './views/profile';
import About from './views/about';
import Stats from './views/stats';
import Inbox from './views/inbox';
import Author from './views/author';
import Communities from './views/communities';
import CommunitySettings from './views/community-settings';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import styles from './app.module.css';
import useTheme, { useCustomCss } from './hooks/use-theme';
import { useEffect } from 'react';
import Topbar from './components/topbar';
import StatusBar from './components/status-bar';
import Log from './views/log';
import ChallengeModal from './components/challenge-modal';
import PKC from '@pkcprotocol/pkc-js';
import { feedSortTypes } from './lib/utils';

// debug util
window.PkcJs = PKC;

// community urls used to carry a /p/ prefix, old links and bookmarks keep working
const LegacyCommunityRedirect = () => {
  const { communityAddress, '*': rest } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/${communityAddress}${rest ? `/${rest}` : ''}${search}`} replace />;
};

function App() {
  const [theme] = useTheme();
  const [customCss] = useCustomCss();

  // add theme className to body so it can set the correct body background in index.css
  useEffect(() => {
    document.body.classList.forEach((className) => document.body.classList.remove(className));
    document.body.classList.add(theme);
  }, [theme]);

  // add notification count to title
  const unreadNotificationCount = useAccount()?.unreadNotificationCount;
  useEffect(() => {
    if (unreadNotificationCount) document.title = `(${unreadNotificationCount}) bitbones`;
    else document.title = 'bitbones';
  }, [unreadNotificationCount]);

  const layout = (
    <>
      <ChallengeModal />
      <Topbar />
      <main className={styles.main}>
        <Outlet />
      </main>
      <StatusBar />
    </>
  );

  return (
    <div className={[styles.app, theme].join(' ')}>
      {/* user CSS from settings, after the theme so it can override any variable */}
      {customCss ? <style>{customCss}</style> : undefined}
      <Routes>
        <Route element={layout}>
          {/* post page */}
          <Route path='/:communityAddress/c/:commentCid' element={<Post />} />

          {/* feed pages */}
          {/* the home sort types are literal segments so they outrank /:communityAddress */}
          <Route path='/' element={<Home />} />
          {feedSortTypes.map((sortType) => (
            <Route key={sortType} path={`/${sortType}/:timeFilterName?`} element={<Home sortType={sortType} />} />
          ))}
          <Route path='/catalog/:sortType?/:timeFilterName?' element={<Catalog />} />
          <Route path='/subscriptions/catalog/:sortType?/:timeFilterName?' element={<SubscriptionsCatalog />} />
          <Route path='/subscriptions/:sortType?/:timeFilterName?' element={<Subscriptions />} />

          {/* community pages */}
          <Route path='/:communityAddress/settings' element={<CommunitySettings />} />
          <Route path='/:communityAddress/catalog/:sortType?/:timeFilterName?' element={<CommunityCatalog />} />
          <Route path='/:communityAddress/:sortType?/:timeFilterName?' element={<Community />} />

          {/* profile and settings pages */}
          <Route path='/inbox' element={<Inbox />} />
          <Route path='/profile' element={<Profile />} />
          <Route path='/profile/:accountCommentIndex' element={<PendingPost />} />
          <Route path='/settings' element={<Settings />} />
          <Route path='/communities' element={<Communities />} />
          <Route path='/about' element={<About />} />
          <Route path='/stats/:period?' element={<Stats />} />
          <Route path='/log' element={<Log />} />

          {/* author post history page */}
          <Route path='/u/:authorAddress/c/:commentCid?' element={<Author />} />

          {/* examples and experimental pages */}
          <Route path='/modal/:sortType?' element={<HomeModal />} />
          <Route path='/modal/:communityAddress/c/:commentCid' element={<HomeModal />} />
          <Route path='/text-only/:sortType?' element={<TextOnly />} />
          <Route path='/board/:sortType?' element={<Board />} />
          <Route path='/css-switch/:communityAddress?/:c?/:commentCid?' element={<HomeCssSwitch />} />

          {/* legacy /p/ prefixed community urls */}
          <Route path='/p/:communityAddress/*' element={<LegacyCommunityRedirect />} />

          {/* not found */}
          <Route path='*' element={<NotFound />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
