# Senku V3 — Development & Prompt History Log

> **Static Context for Future AI Agents & LLMs:**
> - **Project**: Senku (Version 3.0.0) — A personal student context hub & workspace for PC (Windows), solo-developed, local-first.
> - **Philosophy**: Zero-friction spaces, global quiet logs, 1-click action deck launchpads, and clean daily notes.
> - **Environment & Safety**:
>   - Operating System: Windows (PowerShell / CMD).
>   - Storage isolation: Development environment storage is isolated to `%APPDATA%\senku-dev` so installed Senku (v2.4) remains untouched and runnable concurrently.
>   - Core Safety Rule: STRICTLY read & launch only for local files on disk. NEVER delete, rename, or alter user files in their Windows folders.
>   - Commands: Direct execution policy in PowerShell can be restricted; run builds via `cmd /c "npm run build"`.
> - **Architecture**:
>   - Electron 35 + TypeScript + Vite.
>   - Pure Vanilla CSS design tokens; no Tailwind.
>   - Multi-window / Single-instance Electron with JSON persistence in userData.
> - **Prompt Logging Rule**: EVERY user prompt from V3 onwards must be logged chronologically in this file with context and decisions, ensuring full continuity across agent and LLM sessions.

---

## Session Log & Prompts

### Prompt 1 — Architecture Reflection & Core Friction Fixes
- **Date / Time**: 2026-10-19T23:40:43+05:30
- **User Prompt**:
> honestly, this all is not working. yeah senku v3 had some major changes and they all are great but some thing is missing for senku.
> these are still lot of possibilites of senku for to be and not to be.
> so we have to carefully plan everything.
> and first I will tell to my experience as a user.
> senku first experience is great.
> spaces idea is mixed, because if spaces are not there then senku is like cheap basic file explorer, but multiple spaces still create some friction. and less setting in space makes it good.
> log are great, with added search bar makes them great, and one thing I liked about logs is they are global, in case if they are per space that would simply kill the feature. and lot of future is left fot logs. then launch pad, it is not good not bad. its simplicity and clickable boxes make it good but still it need work. home page is nothing, it has nothing so no complaints on it. but it needs careful design what should be there in it and what should not.
> and one feature I want to change which was by mistakely inhereted from old senku is when changeing spaces page refreshes to home, and another while creating spaces, we hit enter and space created and still we are at space create window with empty fields so remove these two logics. and improve the them.
> and thats it nothing left to say and nothing left in senku.
> there is lot of potential for this new senku and slowly we make senku possible and really useful to students.
> first we discuss about this, then I will say what to do and all

- **Analysis & Key Takeaways**:
  1. *Space Switch Reset Bug*: In `src/events.ts`, space clicking explicitly called `setView('Home')`. Fixed to preserve the current active view (`currentView`) so browsing files or notes remains uninterrupted.
  2. *Space Creation Modal Duplicate Bug*: `#add-space` was bound twice (once in `bindSidebar` and once in a global capture listener), mounting two overlapping modal dialogs. Hitting Enter closed the first one, exposing the second empty dialog. Removed the duplicate binding so it cleanly closes and switches into the new space.
  3. *Core Product Clarity*: Spaces need zero friction (minimal settings: Name + Folder). Logs must stay global as a student second-brain. Home needs thoughtful evolution as a daily student command center.

---

### Prompt 2 — Notes Evolution, Log Sequence Numbers & Prompt Archiving
- **Date / Time**: 2026-10-20T00:00:42+05:30
- **User Prompt**:
> bro I forgot to address these two features.
> 1. about rough note. rough note is great, per space idea is also good, but I have experimental fetures like making rough note from static to dynamic. by giving it life but it comes with either heavy fiction and complex implementation.
> I will slowly increse the complexity of ideas,
> make rough note to notes, where we can create txt files and able to open in senku.
> we can literellay make a small quick overlay and start noteing anything without spliting or shifting tabs. offcourse it should be small and it should append the snippets to opened file in notes so, everytime we write it gets appended down, and we have entire notes in that file. then for new notes we can create another folder.
> they will save inside senku so user no need to create txt and then open it etc. if user want it, then we provide export button and it simply exports to browsed folder.
> many idea are there.
> and logs dont have delete button, so adding it look useful but I dont want any performance issues with it. because logs are best thing in senku dont want to mess it.
> but we can add a serial number for them, starting from 1. and they are permanet, deleting them wont rewrite them. so we can use them for hashing and lookup in future and they are like page numbers. if we tear something, page no still show same nos.
> and from now on save all my promts in versions folder. I dont know how you plan, put every promt should be stored and if I change the llm or agent it should understand this context, so write a static promt about this at begining of that file. so I development and my work should be stored and can be shown to somebody later they ask me what you were doing. so thats it bro continue.
> and save my prev prompt also. and from now on we are noteing.
> past is past leave it.

- **Actions Taken**:
  1. Created `versions/version-3.md` with static context for future agents and recorded Prompt 1 and Prompt 2.
  2. Fixed space switching view reset bug (`currentView` preserved).
  3. Fixed space creation modal duplicate overlay bug.
  4. Added permanent sequential numbering (`#1`, `#2`...) to Quiet Log entries (stored and monotonically incremented; deleting an entry never rewrites previous sequence numbers).
  5. Added lightweight log delete capability (`✕` on hover/click) with zero performance impact.
