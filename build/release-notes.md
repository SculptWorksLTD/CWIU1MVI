CWIU1MVI: decoder CW per Mac, Windows e Linux. Sviluppato da IU1MVI, uso libero per tutti gli OM.

**Installazione**
- **Mac:** scarica `Mac.pkg` e aprilo. Se il Mac lo blocca: Impostazioni di Sistema › Privacy e sicurezza › Apri comunque.
- **Windows:** scarica `Setup.exe` e aprilo. Se compare "PC protetto da Windows": Ulteriori informazioni › Esegui comunque.
- **Linux (PC a 64 bit):** `Linux.deb` per Debian, Ubuntu e Mint (`sudo apt install ./CWIU1MVI-…-Linux.deb`), oppure `Linux.AppImage` per le altre distribuzioni (rendilo eseguibile e avvialo; su Ubuntu serve `libfuse2`). Per il CAT aggiungi il tuo utente al gruppo della porta seriale e rientra: `sudo usermod -aG dialout $USER`.

Chi ha già CWIU1MVI su Mac o Windows non deve fare niente: si aggiorna da solo all'avvio. Su Linux decoder e interfaccia si aggiornano da soli; per una nuova versione completa si scarica di nuovo il pacchetto da qui.

**1.2.15**
- Tre lingue nuove: russo, arabo (scritto da destra a sinistra) e cinese semplificato, nella finestra, nella guida e nei menu.

**1.2.14**
- Windows: l'aggiornamento automatico completo ora funziona davvero (prima lo script di installazione si chiudeva insieme all'app e l'aggiornamento non avveniva). Chi ha una versione precedente su Windows deve installare questa una volta a mano con `Setup.exe`; dalle versioni successive si aggiorna e si riapre da solo.

**1.2.13**
- Windows: dopo un aggiornamento completo CWIU1MVI si riapre da solo (prima restava chiuso). Vale dagli aggiornamenti successivi a questo: per questa volta va riaperto a mano.

**1.2.12**
- The Rigger: se The Rigger si chiude o si aggiorna mentre CWIU1MVI è collegato, l'app non si blocca più (prima poteva restare ferma su "cerco la radio" e smettere di scrivere i log); la porta si apre in un processo separato e CWIU1MVI si ricollega quando The Rigger torna.
- Log: le intestazioni dei file non si ripetono più quando arrivano più righe insieme.

**1.2.11**
- Windows: CWIU1MVI vede le radio di The Rigger (porte CAT via rete) e le propone in Impostazioni › Collegamento.

**1.2.10**
- The Rigger: se chiude la porta (programma chiuso o riavviato) CWIU1MVI segna il CAT come scollegato e, appena la porta ricompare, ricollega la radio da solo e rimette ascolto e inseguimento com'erano.

**1.2.9**
- Ascolto, monitoraggio e inseguimento continuano anche con la finestra coperta, ridotta a icona o con lo schermo spento: prima il sistema li metteva in pausa.
- Mentre ascolta, il Mac non va in stop da solo (lo schermo invece può spegnersi).
- Nella cartella del log un registro degli eventi (eventi-AAAA-MM-GG.csv) dice quando e perché si sono fermati CAT, ascolto e inseguimento.

**1.2.8**
- Il menu Collegamento compare solo quando The Rigger è davvero in esecuzione, e sparisce quando lo chiudi.

**1.2.7**
- Mac e Linux: CWIU1MVI può raggiungere la radio attraverso The Rigger, così i due programmi (e gli altri collegati a The Rigger) lavorano insieme. In Impostazioni della radio, alla voce Collegamento, scegli una delle porte "The Rigger · …" e premi Collega CAT. Su Windows le porte di The Rigger sono porte COM normali: si scelgono dall'elenco delle porte.
- Se la radio non risponde, il messaggio ora dice anche di controllare che non sia occupata da un altro programma.

**1.2.6**
- Mac: dopo un aggiornamento non compare più la richiesta del portachiavi e il CAT si ricollega subito. Chi usa HamQTH deve reinserire una volta utente e password nelle Preferenze.

**1.2.5**
- Gli aggiornamenti arrivano dalla nuova repo CWIU1MVI.
- Linux: pacchetti AppImage e .deb.
