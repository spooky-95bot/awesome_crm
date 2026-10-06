// src/components/organisms/DataTable.tsx — basit, jenerik tablo organizması.
import { Card } from '../atoms/Card';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty = 'Kayıt yok',
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-4 py-3 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-gray-400"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-4 py-3 text-gray-700">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
