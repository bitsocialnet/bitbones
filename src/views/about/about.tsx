import styles from './about.module.css';
import { useTranslation } from 'react-i18next';
import type { ChangeEvent } from 'react';

function About() {
  const { t, i18n } = useTranslation();
  const { changeLanguage, language } = i18n;
  // i18next types supportedLngs as 'false | readonly string[] | undefined', src/lib/init-translations.ts always sets it to the language list
  const supportedLngs = i18n.options.supportedLngs as readonly string[];

  // some language codes have more than 2 chars, like 'ckb' and 'cimode' (the CI test mode, which shows the key, e.g. about_bitsocial)
  const languageOptions = supportedLngs.map((language) => (
    <option key={language} value={language}>
      {language.substring(0, 2)}
    </option>
  ));
  const onSelectLanguage = (e: ChangeEvent<HTMLSelectElement>) => changeLanguage(e.target.value);

  return (
    <div className={styles.about}>
      <img alt='logo' className={styles.logo} src='/favicon.ico' />
      <p>{t('about_bitbones')}</p>
      <ul>
        <li>
          <span className={styles.title}>github:</span>{' '}
          <a href='https://github.com/bitsocialnet/bitbones' target='_blank' rel='noreferrer'>
            https://github.com/bitsocialnet/bitbones
          </a>
        </li>
        <li>
          <span className={styles.title}>windows/mac/linux app:</span>{' '}
          <a href='https://github.com/bitsocialnet/bitbones/releases/latest' target='_blank' rel='noreferrer'>
            https://github.com/bitsocialnet/bitbones/releases/latest
          </a>
        </li>
        <li>
          <span className={styles.title}>android app:</span>{' '}
          <a href='https://github.com/bitsocialnet/bitbones/releases/latest' target='_blank' rel='noreferrer'>
            https://github.com/bitsocialnet/bitbones/releases/latest
          </a>
        </li>
        <li>
          <span className={styles.title}>open source license (GPL-3.0-or-later):</span>{' '}
          <a href='https://github.com/bitsocialnet/bitbones/blob/master/LICENSE' target='_blank' rel='noreferrer'>
            https://github.com/bitsocialnet/bitbones/blob/master/LICENSE
          </a>
        </li>
      </ul>
      <p>{t('about_bitsocial')}</p>
      <ul>
        <li>
          <span className={styles.title}>website:</span>{' '}
          <a href='https://bitsocial.net' target='_blank' rel='noreferrer'>
            https://bitsocial.net
          </a>
        </li>
        <li>
          <span className={styles.title}>reddit app:</span>{' '}
          <a href='https://seedit.app' target='_blank' rel='noreferrer'>
            https://seedit.app
          </a>
        </li>
        <li>
          <span className={styles.title}>4chan app:</span>{' '}
          <a href='https://5chan.app' target='_blank' rel='noreferrer'>
            https://5chan.app
          </a>
        </li>
        <li>
          <span className={styles.title}>docs:</span>{' '}
          <a href='https://docs.bitsocial.net' target='_blank' rel='noreferrer'>
            https://docs.bitsocial.net
          </a>
        </li>
        <li>
          <span className={styles.title}>github:</span>{' '}
          <a href='https://github.com/bitsocialnet' target='_blank' rel='noreferrer'>
            https://github.com/bitsocialnet
          </a>
        </li>
        <li>
          <span className={styles.title}>x:</span>{' '}
          <a href='https://x.com/bitsocialnet' target='_blank' rel='noreferrer'>
            https://x.com/bitsocialnet
          </a>
        </li>
        <li>
          <span className={styles.title}>telegram:</span>{' '}
          <a href='https://t.me/bitsocialnet' target='_blank' rel='noreferrer'>
            https://t.me/bitsocialnet
          </a>
        </li>
      </ul>
      <p>
        <select onChange={onSelectLanguage} value={language}>
          {languageOptions}
        </select>
      </p>
    </div>
  );
}

export default About;
