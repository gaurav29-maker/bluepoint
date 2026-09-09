/** The expert console shares the OS shell — same dark ground, same terminal
 *  typography. It is a working tool for the person delivering the product. */
export default function ExpertLayout({ children }: { children: React.ReactNode }) {
  return <div className="site-dark os">{children}</div>;
}
