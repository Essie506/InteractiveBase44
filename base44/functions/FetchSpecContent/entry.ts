export default async function(req) {
  try {
    const body = await req.json();
    const { file_url } = body;
    if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });
    const res = await fetch(file_url);
    if (!res.ok) return Response.json({ error: 'Failed to fetch file: ' + res.status }, { status: 502 });
    const content = await res.text();
    return Response.json({ content });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}