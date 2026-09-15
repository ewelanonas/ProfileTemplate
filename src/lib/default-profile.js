'use strict';

/** Seed content shown on first boot, before anything is edited in the admin area. */
module.exports = {
  name: 'Your Name',
  headline: 'Software Engineer',
  tagline: 'I build reliable, human friendly software.',
  location: 'City, Country',
  email: 'you@example.com',
  phone: '',
  website: '',
  availability: 'Open to new opportunities',
  summary:
    'Short introduction about yourself: what you do, the kind of problems you enjoy solving, and what you are looking for next. Log in to the admin area to replace this text with your own story.',
  socials: [
    { label: 'GitHub', url: 'https://github.com/', icon: 'github' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/', icon: 'linkedin' },
  ],
  skills: [
    { category: 'Languages', items: ['JavaScript', 'TypeScript', 'Python', 'SQL'] },
    { category: 'Frameworks', items: ['Node.js', 'Express', 'React'] },
    { category: 'Tooling', items: ['Git', 'Docker', 'Linux', 'CI/CD'] },
  ],
  experience: [
    {
      role: 'Your Role',
      company: 'Company Name',
      location: 'City, Country',
      start: '2023',
      end: '',
      current: true,
      summary: 'One or two lines describing the scope of the role.',
      bullets: [
        'A result you delivered, with a number if you have one.',
        'A system you built, owned or improved.',
      ],
    },
  ],
  education: [
    {
      degree: 'Your Degree',
      school: 'University Name',
      location: 'City, Country',
      start: '2016',
      end: '2020',
      details: '',
    },
  ],
  projects: [
    {
      title: 'Project Name',
      description: 'What the project does, who it is for, and the part you built.',
      tech: ['Node.js', 'Express'],
      url: '',
      repo: '',
      highlight: true,
    },
  ],
  certifications: [],
  languages: [{ name: 'English', level: 'Professional' }],
  interests: [],
  theme: { accent: '#6c8cff', mode: 'dark' },
  media: { photo: '', background: '', cv: '', cvName: '', cvUpdatedAt: '' },
  updatedAt: new Date(0).toISOString(),
};
