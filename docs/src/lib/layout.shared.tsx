import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const gitConfig = {
  user: "ilyamore88",
  repo: "soup",
  branch: "master",
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Lohikeitto",
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
