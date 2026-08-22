import { Route, Routes, Outlet } from 'react-router-dom';
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
import Inbox from './views/inbox';
import Author from './views/author';
import Communities from './views/communities';
import CommunitySettings from './views/community-settings';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import styles from './app.module.css';
import useTheme from './hooks/use-theme';
import { useEffect } from 'react';
import Menu from './components/menu';
import Footer from './components/footer';
import ChallengeModal from './components/challenge-modal';
import PKC from '@pkcprotocol/pkc-js';

// debug util
window.PkcJs = PKC;

function App() {
  const [theme] = useTheme();

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
    <div>
      <ChallengeModal />
      <Menu />
      <Outlet />
      <Footer />
    </div>
  );

  return (
    <div className={[styles.app, theme].join(' ')}>
      <Routes>
        <Route element={layout}>
          {/* post page */}
          <Route path='/p/:communityAddress/c/:commentCid' element={<Post />} />

          {/* feed pages */}
          <Route path='/:sortType?/:timeFilterName?' element={<Home />} />
          <Route path='/catalog/:sortType?/:timeFilterName?' element={<Catalog />} />
          <Route path='/p/subscriptions/catalog/:sortType?/:timeFilterName?' element={<SubscriptionsCatalog />} />
          <Route path='/p/subscriptions/:sortType?/:timeFilterName?' element={<Subscriptions />} />

          {/* community pages */}
          <Route path='/p/:communityAddress/settings' element={<CommunitySettings />} />
          <Route path='/p/:communityAddress/catalog/:sortType?/:timeFilterName?' element={<CommunityCatalog />} />
          <Route path='/p/:communityAddress/:sortType?/:timeFilterName?' element={<Community />} />

          {/* profile and settings pages */}
          <Route path='/inbox' element={<Inbox />} />
          <Route path='/profile' element={<Profile />} />
          <Route path='/profile/:accountCommentIndex' element={<PendingPost />} />
          <Route path='/settings' element={<Settings />} />
          <Route path='/communities' element={<Communities />} />
          <Route path='/about' element={<About />} />

          {/* author post history page */}
          <Route path='/u/:authorAddress/c/:commentCid?' element={<Author />} />

          {/* examples and experimental pages */}
          <Route path='/modal/:sortType?' element={<HomeModal />} />
          <Route path='/modal/p/:communityAddress/c/:commentCid' element={<HomeModal />} />
          <Route path='/text-only/:sortType?' element={<TextOnly />} />
          <Route path='/board/:sortType?' element={<Board />} />
          <Route path='/css-switch/:p?/:communityAddress?/:c?/:commentCid?' element={<HomeCssSwitch />} />

          {/* not found */}
          <Route path='*' element={<NotFound />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
